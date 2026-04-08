"""WorkOS Enterprise Platform — Backend Server"""
from dotenv import load_dotenv
load_dotenv()

from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, Request, Response,
    WebSocket, WebSocketDisconnect, UploadFile, File as FastAPIFile,
    Query
)
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
import os, uuid, bcrypt, jwt, logging, secrets, random, string
from datetime import datetime, timezone, timedelta
from pathlib import Path
import requests as http_requests
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ─── CONFIG ───────────────────────────────────────────────────────────────────
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_ALG = "HS256"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "workos"

# ─── DATABASE ─────────────────────────────────────────────────────────────────
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ─── APP ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="WorkOS Enterprise Platform")
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── WEBSOCKET MANAGER ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.connections[user_id] = ws

    def disconnect(self, user_id: str):
        self.connections.pop(user_id, None)

    async def send(self, user_id: str, data: dict):
        ws = self.connections.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id)

    async def broadcast(self, user_ids: List[str], data: dict):
        for uid in user_ids:
            await self.send(uid, data)

manager = ConnectionManager()

# ─── OBJECT STORAGE ───────────────────────────────────────────────────────────
storage_key = None

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    try:
        resp = http_requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": EMERGENT_KEY},
            timeout=30
        )
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(500, "Storage unavailable")
    resp = http_requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def get_object_storage(path: str) -> tuple:
    key = init_storage()
    if not key:
        raise HTTPException(500, "Storage unavailable")
    resp = http_requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def create_access_token(user_id: str, email: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": email, "type": "access",
         "exp": datetime.now(timezone.utc) + timedelta(minutes=60)},
        JWT_SECRET, algorithm=JWT_ALG
    )

def create_refresh_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "type": "refresh",
         "exp": datetime.now(timezone.utc) + timedelta(days=7)},
        JWT_SECRET, algorithm=JWT_ALG
    )

def generate_username(name: str) -> str:
    parts = name.lower().strip().split()
    first = parts[0] if parts else "user"
    last = parts[-1] if len(parts) > 1 else ""
    base = f"{first}.{last}" if last else first
    suffix = str(random.randint(100, 999))
    return base + suffix

def generate_temp_password() -> str:
    upper = random.choice(string.ascii_uppercase)
    lower = ''.join(random.choices(string.ascii_lowercase, k=4))
    digits = ''.join(random.choices(string.digits, k=3))
    return f"{upper}{lower}@{digits}"

async def get_current_user(request: Request) -> dict:
    # Try JWT access token
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
            if payload.get("type") == "access":
                user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
                if user:
                    user.pop("password_hash", None)
                    return user
        except jwt.InvalidTokenError:
            pass

    # Try Google OAuth session token
    session_token = request.cookies.get("session_token")
    if session_token:
        session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if session:
            exp = session.get("expires_at")
            if isinstance(exp, str):
                exp = datetime.fromisoformat(exp)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > datetime.now(timezone.utc):
                user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
                if user:
                    user.pop("password_hash", None)
                    return user

    # Try Authorization Bearer header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
            if payload.get("type") == "access":
                user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
                if user:
                    user.pop("password_hash", None)
                    return user
        except jwt.InvalidTokenError:
            pass
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if session:
            exp = session.get("expires_at")
            if isinstance(exp, str):
                exp = datetime.fromisoformat(exp)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > datetime.now(timezone.utc):
                user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
                if user:
                    user.pop("password_hash", None)
                    return user

    raise HTTPException(status_code=401, detail="Not authenticated")

async def auth_required(request: Request) -> dict:
    return await get_current_user(request)

# ─── MODELS ───────────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    email: str
    password: str
    name: str
    role: str = "worker"
    department_id: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    department_id: Optional[str] = None
    picture: Optional[str] = None

class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    color: str = "#4F46E5"
    hod_id: Optional[str] = None

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    hod_id: Optional[str] = None

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    status: str = "todo"
    priority: str = "medium"
    assignee_id: Optional[str] = None
    department_id: Optional[str] = None
    sprint: Optional[str] = None
    due_date: Optional[str] = None
    tags: List[str] = []

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None
    sprint: Optional[str] = None
    due_date: Optional[str] = None
    tags: Optional[List[str]] = None

class CommentCreate(BaseModel):
    content: str

class MeetingCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    start_time: str
    end_time: str
    attendee_ids: List[str] = []
    department_id: Optional[str] = None
    notes: Optional[str] = ""

class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    notes: Optional[str] = None

class AIChatRequest(BaseModel):
    message: str

class GoogleSessionRequest(BaseModel):
    session_id: str

# ─── EXTENDED MODELS ──────────────────────────────────────────────────────────
class DepartmentWithHOD(BaseModel):
    name: str
    description: Optional[str] = ""
    color: str = "#4F46E5"
    icon: Optional[str] = "building"
    status: str = "active"
    hod_full_name: str
    hod_email: str
    hod_username: Optional[str] = None
    hod_temp_password: Optional[str] = None
    hod_mobile: Optional[str] = None
    hod_title: Optional[str] = "Head of Department"
    hod_bio: Optional[str] = None
    hod_joining_date: Optional[str] = None
    hod_linkedin: Optional[str] = None
    hod_github: Optional[str] = None

class FullUserCreate(BaseModel):
    full_name: str
    email: str
    role: str = "worker"
    department_id: Optional[str] = None
    username: Optional[str] = None
    temp_password: Optional[str] = None
    mobile_number: Optional[str] = None
    employee_id: Optional[str] = None
    professional_title: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    joining_date: Optional[str] = None
    picture: Optional[str] = None
    skills: List[str] = []
    bio: Optional[str] = None
    experience_level: Optional[str] = None
    employment_type: str = "full_time"
    shift_timing: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    instagram_id: Optional[str] = None
    facebook_id: Optional[str] = None
    portfolio_url: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    is_active: bool = True

class UserUpdateFull(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    department_id: Optional[str] = None
    picture: Optional[str] = None
    mobile_number: Optional[str] = None
    professional_title: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    joining_date: Optional[str] = None
    skills: Optional[List[str]] = None
    bio: Optional[str] = None
    experience_level: Optional[str] = None
    employment_type: Optional[str] = None
    shift_timing: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    instagram_id: Optional[str] = None
    facebook_id: Optional[str] = None
    portfolio_url: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None

class TransferWorker(BaseModel):
    new_department_id: str
    new_reporting_manager_id: Optional[str] = None

class ResetPasswordReq(BaseModel):
    new_password: Optional[str] = None

# ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
@api_router.post("/auth/register")
async def register(data: UserRegister, response: Response):
    email = data.email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(400, "Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user = {
        "user_id": user_id,
        "email": email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": data.role,
        "department_id": data.department_id,
        "picture": "",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one({**user})
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    response.set_cookie("access_token", access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    user.pop("password_hash", None)
    return user

@api_router.post("/auth/login")
async def login(data: UserLogin, response: Response):
    email = data.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    if not user.get("is_active", True):
        raise HTTPException(403, "Account disabled")
    access_token = create_access_token(user["user_id"], email)
    refresh_token = create_refresh_token(user["user_id"])
    response.set_cookie("access_token", access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    user.pop("password_hash", None)
    return user

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out"}

@api_router.get("/auth/me")
async def me(current_user: dict = Depends(auth_required)):
    # Enrich with department name
    if current_user.get("department_id"):
        dept = await db.departments.find_one({"department_id": current_user["department_id"]}, {"_id": 0})
        if dept:
            current_user["department_name"] = dept.get("name", "")
    return current_user

@api_router.post("/auth/google/session")
async def google_session(data: GoogleSessionRequest, response: Response):
    try:
        r = http_requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": data.session_id},
            timeout=30
        )
        r.raise_for_status()
        oauth_data = r.json()
    except Exception as e:
        raise HTTPException(400, f"OAuth failed: {e}")

    email = oauth_data["email"].lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": oauth_data.get("name", email),
            "picture": oauth_data.get("picture", ""),
            "role": "worker",
            "department_id": None,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one({**user})
    else:
        await db.users.update_one(
            {"email": email},
            {"$set": {"picture": oauth_data.get("picture", user.get("picture", ""))}}
        )
        user = await db.users.find_one({"email": email}, {"_id": 0})

    session_token = oauth_data["session_token"]
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    await db.user_sessions.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"session_token": session_token, "expires_at": expires_at, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    response.set_cookie("session_token", session_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    user.pop("password_hash", None)
    return user

@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(401, "User not found")
        access_token = create_access_token(user["user_id"], user["email"])
        response.set_cookie("access_token", access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
        return {"message": "Token refreshed"}
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid refresh token")

# ─── USER ROUTES ──────────────────────────────────────────────────────────────
@api_router.get("/users")
async def get_users(current_user: dict = Depends(auth_required)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.get("/users/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(auth_required)):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "User not found")
    return user

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: UserUpdate, current_user: dict = Depends(auth_required)):
    if current_user["user_id"] != user_id and current_user["role"] != "super_admin":
        raise HTTPException(403, "Forbidden")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"user_id": user_id}, {"$set": update})
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return user

# ─── DEPARTMENT ROUTES ────────────────────────────────────────────────────────
@api_router.get("/departments")
async def get_departments(current_user: dict = Depends(auth_required)):
    depts = await db.departments.find({}, {"_id": 0}).to_list(100)
    # Enrich with member counts
    for dept in depts:
        count = await db.users.count_documents({"department_id": dept["department_id"]})
        dept["member_count"] = count
        hod = await db.users.find_one({"user_id": dept.get("hod_id")}, {"_id": 0, "name": 1, "email": 1})
        dept["hod_name"] = hod["name"] if hod else "Unassigned"
    return depts

@api_router.post("/departments")
async def create_department(data: DepartmentCreate, current_user: dict = Depends(auth_required)):
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Super admin only")
    dept_id = f"dept_{uuid.uuid4().hex[:10]}"
    dept = {
        "department_id": dept_id,
        "name": data.name,
        "description": data.description,
        "color": data.color,
        "hod_id": data.hod_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.departments.insert_one({**dept})
    if data.hod_id:
        await db.users.update_one({"user_id": data.hod_id}, {"$set": {"department_id": dept_id, "role": "hod"}})
    return {**dept, "_id": None}

@api_router.put("/departments/{dept_id}")
async def update_department(dept_id: str, data: DepartmentUpdate, current_user: dict = Depends(auth_required)):
    if current_user["role"] not in ["super_admin", "hod"]:
        raise HTTPException(403, "Forbidden")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        await db.departments.update_one({"department_id": dept_id}, {"$set": update})
    dept = await db.departments.find_one({"department_id": dept_id}, {"_id": 0})
    return dept

@api_router.delete("/departments/{dept_id}")
async def delete_department(dept_id: str, current_user: dict = Depends(auth_required)):
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Super admin only")
    await db.departments.delete_one({"department_id": dept_id})
    return {"message": "Deleted"}

# ─── TASK ROUTES ──────────────────────────────────────────────────────────────
@api_router.get("/tasks")
async def get_tasks(
    department_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    status: Optional[str] = None,
    sprint: Optional[str] = None,
    current_user: dict = Depends(auth_required)
):
    query = {}
    if department_id:
        query["department_id"] = department_id
    if assignee_id:
        query["assignee_id"] = assignee_id
    if status:
        query["status"] = status
    if sprint:
        query["sprint"] = sprint
    # Workers see only their dept tasks
    if current_user["role"] == "worker" and not department_id:
        query["$or"] = [
            {"assignee_id": current_user["user_id"]},
            {"department_id": current_user.get("department_id")}
        ]
    elif current_user["role"] == "hod" and not department_id:
        query["department_id"] = current_user.get("department_id")
    tasks = await db.tasks.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with assignee names
    for task in tasks:
        if task.get("assignee_id"):
            u = await db.users.find_one({"user_id": task["assignee_id"]}, {"_id": 0, "name": 1, "picture": 1})
            task["assignee_name"] = u["name"] if u else "Unassigned"
            task["assignee_picture"] = u.get("picture", "") if u else ""
    return tasks

@api_router.post("/tasks")
async def create_task(data: TaskCreate, current_user: dict = Depends(auth_required)):
    task_id = f"task_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    task = {
        "task_id": task_id,
        "title": data.title,
        "description": data.description,
        "status": data.status,
        "priority": data.priority,
        "assignee_id": data.assignee_id,
        "reporter_id": current_user["user_id"],
        "reporter_name": current_user["name"],
        "department_id": data.department_id or current_user.get("department_id"),
        "sprint": data.sprint,
        "due_date": data.due_date,
        "tags": data.tags,
        "created_at": now,
        "updated_at": now
    }
    await db.tasks.insert_one({**task})
    # Notify assignee
    if data.assignee_id and data.assignee_id != current_user["user_id"]:
        notif_id = f"notif_{uuid.uuid4().hex[:10]}"
        notif = {
            "notification_id": notif_id,
            "user_id": data.assignee_id,
            "type": "task_assigned",
            "title": "New Task Assigned",
            "message": f"{current_user['name']} assigned you: {data.title}",
            "is_read": False,
            "data": {"task_id": task_id},
            "created_at": now
        }
        await db.notifications.insert_one({**notif})
        await manager.send(data.assignee_id, {"type": "notification_new", "data": {**notif, "_id": None}})
    return {**task, "_id": None}

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, data: TaskUpdate, current_user: dict = Depends(auth_required)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tasks.update_one({"task_id": task_id}, {"$set": update})
    task = await db.tasks.find_one({"task_id": task_id}, {"_id": 0})
    # Broadcast task update
    if task:
        dept_users = await db.users.find(
            {"department_id": task.get("department_id")}, {"_id": 0, "user_id": 1}
        ).to_list(100)
        user_ids = [u["user_id"] for u in dept_users]
        await manager.broadcast(user_ids, {"type": "task_updated", "data": {**task}})
    return task

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: dict = Depends(auth_required)):
    await db.tasks.delete_one({"task_id": task_id})
    await db.task_comments.delete_many({"task_id": task_id})
    return {"message": "Deleted"}

@api_router.get("/tasks/{task_id}/comments")
async def get_comments(task_id: str, current_user: dict = Depends(auth_required)):
    comments = await db.task_comments.find({"task_id": task_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return comments

@api_router.post("/tasks/{task_id}/comments")
async def add_comment(task_id: str, data: CommentCreate, current_user: dict = Depends(auth_required)):
    comment_id = f"comment_{uuid.uuid4().hex[:10]}"
    comment = {
        "comment_id": comment_id,
        "task_id": task_id,
        "user_id": current_user["user_id"],
        "user_name": current_user["name"],
        "user_picture": current_user.get("picture", ""),
        "content": data.content,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.task_comments.insert_one({**comment})
    return {**comment, "_id": None}

# ─── NOTIFICATION ROUTES ──────────────────────────────────────────────────────
@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(auth_required)):
    notifs = await db.notifications.find(
        {"user_id": current_user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    return notifs

@api_router.put("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, current_user: dict = Depends(auth_required)):
    await db.notifications.update_one(
        {"notification_id": notif_id, "user_id": current_user["user_id"]},
        {"$set": {"is_read": True}}
    )
    return {"message": "Marked read"}

@api_router.put("/notifications/read-all")
async def mark_all_read(current_user: dict = Depends(auth_required)):
    await db.notifications.update_many(
        {"user_id": current_user["user_id"]},
        {"$set": {"is_read": True}}
    )
    return {"message": "All marked read"}

# ─── FILE ROUTES ──────────────────────────────────────────────────────────────
@api_router.post("/files/upload")
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    task_id: Optional[str] = None,
    department_id: Optional[str] = None,
    current_user: dict = Depends(auth_required)
):
    ext = file.filename.split(".")[-1] if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{current_user['user_id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")
    file_id = f"file_{uuid.uuid4().hex[:10]}"
    record = {
        "file_id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": result.get("size", len(data)),
        "uploader_id": current_user["user_id"],
        "uploader_name": current_user["name"],
        "task_id": task_id,
        "department_id": department_id or current_user.get("department_id"),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.files.insert_one({**record})
    return {**record, "_id": None}

@api_router.get("/files")
async def get_files(
    task_id: Optional[str] = None,
    department_id: Optional[str] = None,
    current_user: dict = Depends(auth_required)
):
    query = {"is_deleted": False}
    if task_id:
        query["task_id"] = task_id
    if department_id:
        query["department_id"] = department_id
    elif current_user["role"] == "worker":
        query["$or"] = [
            {"uploader_id": current_user["user_id"]},
            {"department_id": current_user.get("department_id")}
        ]
    elif current_user["role"] == "hod":
        query["department_id"] = current_user.get("department_id")
    files = await db.files.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return files

@api_router.get("/files/{file_id}/download")
async def download_file(file_id: str, current_user: dict = Depends(auth_required)):
    from fastapi.responses import Response as FastAPIResponse
    record = await db.files.find_one({"file_id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(404, "File not found")
    content, content_type = get_object_storage(record["storage_path"])
    return FastAPIResponse(
        content=content,
        media_type=record.get("content_type", content_type),
        headers={"Content-Disposition": f"attachment; filename=\"{record['original_filename']}\""}
    )

@api_router.delete("/files/{file_id}")
async def delete_file(file_id: str, current_user: dict = Depends(auth_required)):
    await db.files.update_one({"file_id": file_id}, {"$set": {"is_deleted": True}})
    return {"message": "Deleted"}

# ─── ANALYTICS ROUTES ─────────────────────────────────────────────────────────
@api_router.get("/analytics/kpis")
async def get_kpis(current_user: dict = Depends(auth_required)):
    query = {}
    if current_user["role"] == "hod":
        query["department_id"] = current_user.get("department_id")
    elif current_user["role"] == "worker":
        query["assignee_id"] = current_user["user_id"]

    total = await db.tasks.count_documents(query)
    completed = await db.tasks.count_documents({**query, "status": "done"})
    in_progress = await db.tasks.count_documents({**query, "status": "in_progress"})
    blocked = await db.tasks.count_documents({**query, "status": "blocked"})
    review = await db.tasks.count_documents({**query, "status": "review"})

    total_users = await db.users.count_documents({"is_active": True}) if current_user["role"] == "super_admin" else 0
    total_depts = await db.departments.count_documents({}) if current_user["role"] == "super_admin" else 0

    # Due date analysis
    now_iso = datetime.now(timezone.utc).isoformat()
    overdue_q = {**query, "due_date": {"$lt": now_iso}, "status": {"$ne": "done"}}
    overdue = await db.tasks.count_documents(overdue_q)

    return {
        "total_tasks": total,
        "completed": completed,
        "in_progress": in_progress,
        "blocked": blocked,
        "review": review,
        "overdue": overdue,
        "total_users": total_users,
        "total_departments": total_depts,
        "completion_rate": round((completed / total * 100) if total > 0 else 0, 1)
    }

@api_router.get("/analytics/tasks-by-status")
async def tasks_by_status(current_user: dict = Depends(auth_required)):
    query = {}
    if current_user["role"] == "hod":
        query["department_id"] = current_user.get("department_id")
    elif current_user["role"] == "worker":
        query["assignee_id"] = current_user["user_id"]

    statuses = ["todo", "in_progress", "review", "done", "blocked"]
    result = []
    for s in statuses:
        count = await db.tasks.count_documents({**query, "status": s})
        result.append({"status": s, "count": count, "label": s.replace("_", " ").title()})
    return result

@api_router.get("/analytics/department-comparison")
async def dept_comparison(current_user: dict = Depends(auth_required)):
    if current_user["role"] not in ["super_admin"]:
        raise HTTPException(403, "Admin only")
    depts = await db.departments.find({}, {"_id": 0}).to_list(20)
    result = []
    for dept in depts:
        total = await db.tasks.count_documents({"department_id": dept["department_id"]})
        done = await db.tasks.count_documents({"department_id": dept["department_id"], "status": "done"})
        members = await db.users.count_documents({"department_id": dept["department_id"]})
        result.append({
            "name": dept["name"],
            "color": dept.get("color", "#4F46E5"),
            "total_tasks": total,
            "completed": done,
            "members": members,
            "completion_rate": round((done / total * 100) if total > 0 else 0, 1)
        })
    return result

# ─── MEETING ROUTES ───────────────────────────────────────────────────────────
@api_router.get("/meetings")
async def get_meetings(current_user: dict = Depends(auth_required)):
    query = {"$or": [
        {"organizer_id": current_user["user_id"]},
        {"attendee_ids": current_user["user_id"]}
    ]}
    if current_user["role"] == "super_admin":
        query = {}
    meetings = await db.meetings.find(query, {"_id": 0}).sort("start_time", 1).to_list(200)
    return meetings

@api_router.post("/meetings")
async def create_meeting(data: MeetingCreate, current_user: dict = Depends(auth_required)):
    meeting_id = f"mtg_{uuid.uuid4().hex[:10]}"
    meeting = {
        "meeting_id": meeting_id,
        "title": data.title,
        "description": data.description,
        "organizer_id": current_user["user_id"],
        "organizer_name": current_user["name"],
        "attendee_ids": data.attendee_ids,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "department_id": data.department_id or current_user.get("department_id"),
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.meetings.insert_one({**meeting})
    # Notify attendees
    for attendee_id in data.attendee_ids:
        if attendee_id != current_user["user_id"]:
            notif_id = f"notif_{uuid.uuid4().hex[:10]}"
            notif = {
                "notification_id": notif_id,
                "user_id": attendee_id,
                "type": "meeting_invite",
                "title": "Meeting Invitation",
                "message": f"{current_user['name']} invited you to: {data.title}",
                "is_read": False,
                "data": {"meeting_id": meeting_id},
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.notifications.insert_one({**notif})
            await manager.send(attendee_id, {"type": "notification_new", "data": {**notif, "_id": None}})
    return {**meeting, "_id": None}

@api_router.put("/meetings/{meeting_id}")
async def update_meeting(meeting_id: str, data: MeetingUpdate, current_user: dict = Depends(auth_required)):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        await db.meetings.update_one({"meeting_id": meeting_id}, {"$set": update})
    return await db.meetings.find_one({"meeting_id": meeting_id}, {"_id": 0})

@api_router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, current_user: dict = Depends(auth_required)):
    await db.meetings.delete_one({"meeting_id": meeting_id})
    return {"message": "Deleted"}

# ─── AI COPILOT ROUTES ────────────────────────────────────────────────────────
@api_router.post("/ai/chat")
async def ai_chat(data: AIChatRequest, current_user: dict = Depends(auth_required)):
    # Get workspace context
    tasks_q = {"assignee_id": current_user["user_id"]} if current_user["role"] == "worker" else {}
    if current_user["role"] == "hod":
        tasks_q = {"department_id": current_user.get("department_id")}
    recent_tasks = await db.tasks.find(tasks_q, {"_id": 0, "title": 1, "status": 1, "priority": 1}).limit(10).to_list(10)
    tasks_ctx = "; ".join([f"{t['title']} ({t['status']}, {t['priority']})" for t in recent_tasks]) or "No tasks"

    dept_name = ""
    if current_user.get("department_id"):
        dept = await db.departments.find_one({"department_id": current_user["department_id"]}, {"_id": 0, "name": 1})
        dept_name = dept["name"] if dept else ""

    system_msg = f"""You are TeamOS AI Copilot — a professional productivity assistant for a workforce management platform.

Current user: {current_user['name']} | Role: {current_user['role']} | Department: {dept_name or 'N/A'}
Recent tasks context: {tasks_ctx}

Help with task management, team coordination, productivity advice, and workspace questions.
Be concise (2-3 sentences max per response), professional, and actionable.
Always provide specific, practical recommendations."""

    try:
        chat = LlmChat(
            api_key=EMERGENT_KEY,
            session_id=f"workos_{current_user['user_id']}",
            system_message=system_msg
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        response = await chat.send_message(UserMessage(text=data.message))
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        raise HTTPException(503, f"AI service temporarily unavailable. Please try again shortly.")

    # Save to history
    await db.ai_chats.insert_one({
        "chat_id": f"chat_{uuid.uuid4().hex[:10]}",
        "user_id": current_user["user_id"],
        "message": data.message,
        "response": response,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"response": response}

@api_router.get("/ai/history")
async def ai_history(current_user: dict = Depends(auth_required)):
    history = await db.ai_chats.find(
        {"user_id": current_user["user_id"]}, {"_id": 0}
    ).sort("created_at", 1).limit(30).to_list(30)
    return history

# ─── HIERARCHY CREATION ENDPOINTS ────────────────────────────────────────────
@api_router.post("/departments/create-with-hod")
async def create_dept_with_hod(data: DepartmentWithHOD, current_user: dict = Depends(auth_required)):
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Super admin only")
    email = data.hod_email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, f"Email {email} already registered")
    username = data.hod_username or generate_username(data.hod_full_name)
    temp_password = data.hod_temp_password or generate_temp_password()
    # Ensure username unique
    existing_uname = await db.users.find_one({"username": username})
    if existing_uname:
        username = username + str(random.randint(1, 99))
    dept_id = f"dept_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    dept = {
        "department_id": dept_id, "name": data.name, "description": data.description,
        "color": data.color, "icon": data.icon, "status": data.status, "created_at": now
    }
    await db.departments.insert_one({**dept})
    hod_id = f"user_{uuid.uuid4().hex[:12]}"
    count = await db.users.count_documents({})
    hod_user = {
        "user_id": hod_id, "email": email, "name": data.hod_full_name,
        "username": username, "password_hash": hash_password(temp_password),
        "role": "hod", "department_id": dept_id, "picture": "",
        "mobile_number": data.hod_mobile, "professional_title": data.hod_title,
        "bio": data.hod_bio, "linkedin_url": data.hod_linkedin,
        "github_url": data.hod_github, "joining_date": data.hod_joining_date,
        "employee_id": f"EMP{str(count+1).zfill(4)}", "skills": [],
        "is_active": True, "is_temp_password": True,
        "created_by": current_user["user_id"], "created_at": now
    }
    await db.users.insert_one({**hod_user})
    await db.departments.update_one({"department_id": dept_id}, {"$set": {"hod_id": hod_id}})
    dept["hod_id"] = hod_id
    hod_out = {k: v for k, v in hod_user.items() if k not in ["_id", "password_hash"]}
    return {
        "department": {**dept, "_id": None},
        "hod": hod_out,
        "credentials": {"username": username, "temp_password": temp_password, "email": email}
    }

@api_router.post("/users/create-full")
async def create_full_user(data: FullUserCreate, current_user: dict = Depends(auth_required)):
    if current_user["role"] == "worker":
        raise HTTPException(403, "Workers cannot create users")
    if current_user["role"] == "hod":
        if data.role not in ("worker",):
            raise HTTPException(403, "HODs can only create workers")
        if data.department_id and data.department_id != current_user.get("department_id"):
            raise HTTPException(403, "HODs can only create users in their own department")
        data.department_id = current_user.get("department_id")
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    username = data.username or generate_username(data.full_name)
    existing_uname = await db.users.find_one({"username": username})
    if existing_uname:
        username = username + str(random.randint(1, 99))
    temp_password = data.temp_password or generate_temp_password()
    count = await db.users.count_documents({})
    employee_id = data.employee_id or f"EMP{str(count+1).zfill(4)}"
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email,
        "name": data.full_name, "username": username,
        "password_hash": hash_password(temp_password), "role": data.role,
        "department_id": data.department_id, "picture": data.picture or "",
        "mobile_number": data.mobile_number, "employee_id": employee_id,
        "professional_title": data.professional_title,
        "reporting_manager_id": data.reporting_manager_id,
        "joining_date": data.joining_date, "skills": data.skills, "bio": data.bio,
        "experience_level": data.experience_level, "employment_type": data.employment_type,
        "shift_timing": data.shift_timing, "linkedin_url": data.linkedin_url,
        "github_url": data.github_url, "instagram_id": data.instagram_id,
        "facebook_id": data.facebook_id, "portfolio_url": data.portfolio_url,
        "address": data.address, "emergency_contact": data.emergency_contact,
        "is_active": data.is_active, "is_temp_password": True,
        "created_by": current_user["user_id"], "created_at": now
    }
    await db.users.insert_one({**user})
    user_out = {k: v for k, v in user.items() if k not in ["_id", "password_hash"]}
    return {"user": user_out, "credentials": {"username": username, "temp_password": temp_password, "email": email}}

@api_router.put("/users/{user_id}/update-full")
async def update_user_full(user_id: str, data: UserUpdateFull, current_user: dict = Depends(auth_required)):
    if current_user["user_id"] != user_id and current_user["role"] not in ["super_admin", "hod"]:
        raise HTTPException(403, "Forbidden")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"user_id": user_id}, {"$set": update})
    return await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})

@api_router.put("/users/{user_id}/suspend")
async def suspend_user(user_id: str, current_user: dict = Depends(auth_required)):
    if current_user["role"] not in ["super_admin", "hod"]:
        raise HTTPException(403, "Forbidden")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    if current_user["role"] == "hod" and user.get("department_id") != current_user.get("department_id"):
        raise HTTPException(403, "Can only manage users in your department")
    new_status = not user.get("is_active", True)
    await db.users.update_one({"user_id": user_id}, {"$set": {"is_active": new_status}})
    return {"user_id": user_id, "is_active": new_status}

@api_router.put("/users/{user_id}/transfer")
async def transfer_worker(user_id: str, data: TransferWorker, current_user: dict = Depends(auth_required)):
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Super admin only")
    update = {"department_id": data.new_department_id}
    if data.new_reporting_manager_id:
        update["reporting_manager_id"] = data.new_reporting_manager_id
    await db.users.update_one({"user_id": user_id}, {"$set": update})
    return await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})

@api_router.post("/users/{user_id}/reset-password")
async def reset_user_password(user_id: str, data: ResetPasswordReq, current_user: dict = Depends(auth_required)):
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Super admin only")
    new_pwd = data.new_password or generate_temp_password()
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"password_hash": hash_password(new_pwd), "is_temp_password": True}}
    )
    return {"new_password": new_pwd}

# ─── WEBSOCKET ────────────────────────────────────────────────────────────────
@app.websocket("/api/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            # Echo heartbeat
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(user_id)

app.include_router(api_router)

# ─── STARTUP + SEED ───────────────────────────────────────────────────────────
async def seed_database():
    """Idempotent seed data for demo"""
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id")
    await db.departments.create_index("department_id")
    await db.tasks.create_index("task_id")
    await db.notifications.create_index("user_id")

    # Check if already seeded
    if await db.users.count_documents({}) > 0:
        logger.info("Database already seeded, skipping...")
        # Update admin password if changed
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@teamOS.com")
        admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
        existing = await db.users.find_one({"email": admin_email.lower()})
        if existing and not verify_password(admin_password, existing.get("password_hash", "")):
            await db.users.update_one(
                {"email": admin_email.lower()},
                {"$set": {"password_hash": hash_password(admin_password)}}
            )
        return

    logger.info("Seeding database...")

    # Create departments
    depts = [
        {"department_id": "dept_engineering", "name": "Engineering", "description": "Product development and technical operations", "color": "#4F46E5"},
        {"department_id": "dept_marketing", "name": "Marketing", "description": "Brand, content and growth strategy", "color": "#10B981"},
        {"department_id": "dept_operations", "name": "Operations", "description": "Business operations and delivery excellence", "color": "#F59E0B"},
    ]
    for d in depts:
        d["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.departments.insert_many([{**d} for d in depts])

    # Create users
    user_data = [
        {"email": "admin@teamOS.com", "name": "Alex Chen", "role": "super_admin", "department_id": None, "password": "Admin@123"},
        {"email": "sarah.miller@teamOS.com", "name": "Sarah Miller", "role": "hod", "department_id": "dept_engineering", "password": "Hod@123"},
        {"email": "james.wilson@teamOS.com", "name": "James Wilson", "role": "hod", "department_id": "dept_marketing", "password": "Hod@123"},
        {"email": "maya.patel@teamOS.com", "name": "Maya Patel", "role": "hod", "department_id": "dept_operations", "password": "Hod@123"},
        {"email": "tom.davis@teamOS.com", "name": "Tom Davis", "role": "worker", "department_id": "dept_engineering", "password": "Worker@123"},
        {"email": "emma.brown@teamOS.com", "name": "Emma Brown", "role": "worker", "department_id": "dept_engineering", "password": "Worker@123"},
        {"email": "mike.johnson@teamOS.com", "name": "Mike Johnson", "role": "worker", "department_id": "dept_marketing", "password": "Worker@123"},
        {"email": "lisa.zhang@teamOS.com", "name": "Lisa Zhang", "role": "worker", "department_id": "dept_marketing", "password": "Worker@123"},
        {"email": "chris.lee@teamOS.com", "name": "Chris Lee", "role": "worker", "department_id": "dept_operations", "password": "Worker@123"},
        {"email": "ana.garcia@teamOS.com", "name": "Ana Garcia", "role": "worker", "department_id": "dept_operations", "password": "Worker@123"},
    ]
    uid_map = {}
    for u in user_data:
        uid = f"user_{uuid.uuid4().hex[:12]}"
        uid_map[u["email"]] = uid
        doc = {
            "user_id": uid,
            "email": u["email"].lower(),
            "name": u["name"],
            "password_hash": hash_password(u["password"]),
            "role": u["role"],
            "department_id": u["department_id"],
            "picture": "",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(doc)

    # Set HOD IDs on departments
    await db.departments.update_one({"department_id": "dept_engineering"}, {"$set": {"hod_id": uid_map["sarah.miller@teamOS.com"]}})
    await db.departments.update_one({"department_id": "dept_marketing"}, {"$set": {"hod_id": uid_map["james.wilson@teamOS.com"]}})
    await db.departments.update_one({"department_id": "dept_operations"}, {"$set": {"hod_id": uid_map["maya.patel@teamOS.com"]}})

    # Create tasks
    now = datetime.now(timezone.utc)
    tasks_data = [
        # Engineering
        {"title": "Design API architecture", "status": "done", "priority": "high", "dept": "dept_engineering", "assignee": "tom.davis@teamOS.com", "sprint": "Sprint 1"},
        {"title": "Implement user authentication", "status": "done", "priority": "critical", "dept": "dept_engineering", "assignee": "emma.brown@teamOS.com", "sprint": "Sprint 1"},
        {"title": "Build task management module", "status": "in_progress", "priority": "high", "dept": "dept_engineering", "assignee": "tom.davis@teamOS.com", "sprint": "Sprint 2"},
        {"title": "Set up CI/CD pipeline", "status": "in_progress", "priority": "medium", "dept": "dept_engineering", "assignee": "emma.brown@teamOS.com", "sprint": "Sprint 2"},
        {"title": "Write API documentation", "status": "todo", "priority": "medium", "dept": "dept_engineering", "assignee": "tom.davis@teamOS.com", "sprint": "Sprint 2"},
        {"title": "Performance optimization", "status": "todo", "priority": "high", "dept": "dept_engineering", "assignee": "emma.brown@teamOS.com", "sprint": "Sprint 3"},
        {"title": "Security audit", "status": "review", "priority": "critical", "dept": "dept_engineering", "assignee": "tom.davis@teamOS.com", "sprint": "Sprint 2"},
        {"title": "Database schema migration", "status": "blocked", "priority": "high", "dept": "dept_engineering", "assignee": "emma.brown@teamOS.com", "sprint": "Sprint 2"},
        # Marketing
        {"title": "Create Q4 marketing campaign", "status": "in_progress", "priority": "high", "dept": "dept_marketing", "assignee": "mike.johnson@teamOS.com", "sprint": "Sprint 2"},
        {"title": "Social media strategy", "status": "done", "priority": "medium", "dept": "dept_marketing", "assignee": "lisa.zhang@teamOS.com", "sprint": "Sprint 1"},
        {"title": "Product launch blog post", "status": "todo", "priority": "high", "dept": "dept_marketing", "assignee": "mike.johnson@teamOS.com", "sprint": "Sprint 2"},
        {"title": "Customer case studies", "status": "in_progress", "priority": "medium", "dept": "dept_marketing", "assignee": "lisa.zhang@teamOS.com", "sprint": "Sprint 2"},
        {"title": "Email newsletter Q4", "status": "todo", "priority": "low", "dept": "dept_marketing", "assignee": "mike.johnson@teamOS.com", "sprint": "Sprint 3"},
        {"title": "Brand guidelines update", "status": "review", "priority": "medium", "dept": "dept_marketing", "assignee": "lisa.zhang@teamOS.com", "sprint": "Sprint 2"},
        # Operations
        {"title": "Q4 budget planning", "status": "in_progress", "priority": "high", "dept": "dept_operations", "assignee": "chris.lee@teamOS.com", "sprint": "Sprint 2"},
        {"title": "Team onboarding process", "status": "done", "priority": "medium", "dept": "dept_operations", "assignee": "ana.garcia@teamOS.com", "sprint": "Sprint 1"},
        {"title": "Vendor contract renewal", "status": "todo", "priority": "critical", "dept": "dept_operations", "assignee": "chris.lee@teamOS.com", "sprint": "Sprint 2"},
        {"title": "Process automation audit", "status": "in_progress", "priority": "high", "dept": "dept_operations", "assignee": "ana.garcia@teamOS.com", "sprint": "Sprint 2"},
        {"title": "Compliance documentation", "status": "review", "priority": "high", "dept": "dept_operations", "assignee": "chris.lee@teamOS.com", "sprint": "Sprint 2"},
        {"title": "Office supply inventory", "status": "todo", "priority": "low", "dept": "dept_operations", "assignee": "ana.garcia@teamOS.com", "sprint": "Sprint 3"},
    ]
    admin_uid = uid_map["admin@teamOS.com"]
    for i, t in enumerate(tasks_data):
        days_offset = (i % 7) - 3
        due = (now + timedelta(days=days_offset + 5)).isoformat()
        task_id = f"task_{uuid.uuid4().hex[:10]}"
        await db.tasks.insert_one({
            "task_id": task_id,
            "title": t["title"],
            "description": f"Task description for {t['title']}. This is a detailed description of the work to be done.",
            "status": t["status"],
            "priority": t["priority"],
            "assignee_id": uid_map.get(t["assignee"]),
            "reporter_id": admin_uid,
            "reporter_name": "Alex Chen",
            "department_id": t["dept"],
            "sprint": t.get("sprint"),
            "due_date": due,
            "tags": [t["dept"].replace("dept_", ""), t["priority"]],
            "created_at": (now - timedelta(days=i+1)).isoformat(),
            "updated_at": now.isoformat()
        })

    # Create meetings
    meetings = [
        {
            "meeting_id": f"mtg_{uuid.uuid4().hex[:10]}",
            "title": "Daily Standup",
            "description": "Daily team sync and blockers discussion",
            "organizer_id": admin_uid,
            "organizer_name": "Alex Chen",
            "attendee_ids": list(uid_map.values()),
            "start_time": (now + timedelta(hours=2)).isoformat(),
            "end_time": (now + timedelta(hours=2, minutes=30)).isoformat(),
            "department_id": None,
            "notes": "Focus on sprint 2 progress",
            "created_at": now.isoformat()
        },
        {
            "meeting_id": f"mtg_{uuid.uuid4().hex[:10]}",
            "title": "Sprint Review — Sprint 2",
            "description": "Demonstrate completed work and gather stakeholder feedback",
            "organizer_id": uid_map["sarah.miller@teamOS.com"],
            "organizer_name": "Sarah Miller",
            "attendee_ids": [uid_map["sarah.miller@teamOS.com"], uid_map["tom.davis@teamOS.com"], uid_map["emma.brown@teamOS.com"], admin_uid],
            "start_time": (now + timedelta(days=2)).isoformat(),
            "end_time": (now + timedelta(days=2, hours=1)).isoformat(),
            "department_id": "dept_engineering",
            "notes": "",
            "created_at": now.isoformat()
        },
        {
            "meeting_id": f"mtg_{uuid.uuid4().hex[:10]}",
            "title": "Q4 Planning Session",
            "description": "Quarterly planning and OKR setting",
            "organizer_id": admin_uid,
            "organizer_name": "Alex Chen",
            "attendee_ids": [admin_uid, uid_map["sarah.miller@teamOS.com"], uid_map["james.wilson@teamOS.com"], uid_map["maya.patel@teamOS.com"]],
            "start_time": (now + timedelta(days=3, hours=3)).isoformat(),
            "end_time": (now + timedelta(days=3, hours=5)).isoformat(),
            "department_id": None,
            "notes": "Prepare OKR proposals",
            "created_at": now.isoformat()
        }
    ]
    for m in meetings:
        await db.meetings.insert_one({**m})

    # Create notifications for workers
    sample_users = ["tom.davis@teamOS.com", "emma.brown@teamOS.com", "mike.johnson@teamOS.com"]
    for email in sample_users:
        uid = uid_map.get(email)
        if uid:
            await db.notifications.insert_many([
                {
                    "notification_id": f"notif_{uuid.uuid4().hex[:10]}",
                    "user_id": uid,
                    "type": "task_assigned",
                    "title": "New Task Assigned",
                    "message": "Alex Chen assigned you a new task",
                    "is_read": False,
                    "data": {},
                    "created_at": (now - timedelta(hours=2)).isoformat()
                },
                {
                    "notification_id": f"notif_{uuid.uuid4().hex[:10]}",
                    "user_id": uid,
                    "type": "meeting_invite",
                    "title": "Meeting Invitation",
                    "message": "You've been invited to Daily Standup",
                    "is_read": True,
                    "data": {},
                    "created_at": (now - timedelta(hours=5)).isoformat()
                }
            ])

    logger.info("Database seeded successfully!")

    # Write test credentials
    Path("/app/memory").mkdir(parents=True, exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("""# WorkOS Enterprise Platform — Test Credentials

## Admin Account
- **Email**: admin@teamOS.com
- **Password**: Admin@123
- **Role**: super_admin

## HOD Accounts
- **Email**: sarah.miller@teamOS.com | **Password**: Hod@123 | **Dept**: Engineering
- **Email**: james.wilson@teamOS.com | **Password**: Hod@123 | **Dept**: Marketing
- **Email**: maya.patel@teamOS.com | **Password**: Hod@123 | **Dept**: Operations

## Worker Accounts
- **Email**: tom.davis@teamOS.com | **Password**: Worker@123 | **Dept**: Engineering
- **Email**: emma.brown@teamOS.com | **Password**: Worker@123 | **Dept**: Engineering
- **Email**: mike.johnson@teamOS.com | **Password**: Worker@123 | **Dept**: Marketing
- **Email**: lisa.zhang@teamOS.com | **Password**: Worker@123 | **Dept**: Marketing
- **Email**: chris.lee@teamOS.com | **Password**: Worker@123 | **Dept**: Operations
- **Email**: ana.garcia@teamOS.com | **Password**: Worker@123 | **Dept**: Operations

## API Endpoints
- POST /api/auth/login
- POST /api/auth/register
- GET /api/auth/me
- POST /api/auth/google/session
- GET /api/users
- GET /api/departments
- GET /api/tasks
- GET /api/analytics/kpis
- GET /api/meetings
- GET /api/notifications
- POST /api/ai/chat
""")

@app.on_event("startup")
async def startup():
    init_storage()
    await seed_database()

@app.on_event("shutdown")
async def shutdown():
    client.close()
