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
import os, uuid, bcrypt, jwt, logging, secrets, random, string, hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path
import requests as http_requests

# Removed emergentintegrations import to make project completely independent

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

# S3 Config
USE_S3_STORAGE = os.environ.get("USE_S3_STORAGE", "false").lower() == "true"
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
AWS_S3_BUCKET_NAME = os.environ.get("AWS_S3_BUCKET_NAME", "")
AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")
S3_PRESIGNED_URL_EXPIRY = int(os.environ.get("S3_PRESIGNED_URL_EXPIRY", "3600"))

# Local Fallback Config
USE_LOCAL_STORAGE = os.environ.get("USE_LOCAL_STORAGE", "true").lower() == "true"
LOCAL_STORAGE_PATH = os.environ.get("LOCAL_STORAGE_PATH", "./uploads")

if USE_LOCAL_STORAGE:
    os.makedirs(LOCAL_STORAGE_PATH, exist_ok=True)

# ─── DATABASE ─────────────────────────────────────────────────────────────────
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


# ─── SECURITY VALIDATOR ──────────────────────────────────────────────────────
import sys
sys.path.insert(0, str(Path(__file__).parent))
from security.file_validator import validate_upload, ValidationResult


# ─── APP ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="WorkOS Enterprise Platform")
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── WEBSOCKET MANAGER ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}
        self.active_users: set = set()

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.connections[user_id] = ws
        self.active_users.add(user_id)
        # Broadcast online status to relevant people locally
        await self.broadcast_presence(user_id, "online")

    def disconnect(self, user_id: str):
        self.connections.pop(user_id, None)
        self.active_users.discard(user_id)
        # We can't easily await here in __del__ or sync context, 
        # but in websocket_endpoint we handle it async.

    async def handle_disconnect(self, user_id: str):
        self.disconnect(user_id)
        await self.broadcast_presence(user_id, "offline")

    async def broadcast_presence(self, user_id: str, status: str):
        # Notify all connected users about presence change (simple broadcast for now)
        data = {"type": "presence", "user_id": user_id, "status": status, "timestamp": datetime.now(timezone.utc).isoformat()}
        for conn_id in list(self.connections.keys()):
            if conn_id != user_id:
                await self.send(conn_id, data)

    async def send(self, user_id: str, data: dict):
        ws = self.connections.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.active_users.discard(user_id)
                self.connections.pop(user_id, None)

    async def broadcast(self, user_ids: List[str], data: dict):
        for uid in user_ids:
            await self.send(uid, data)

    def is_online(self, user_id: str) -> bool:
        return user_id in self.active_users

manager = ConnectionManager()

# ─── S3 MANAGER ───────────────────────────────────────────────────────────────
class S3Manager:
    """Enterprise S3 storage manager with presigned URLs, multipart upload,
    hierarchical key strategy, and graceful local fallback."""

    def __init__(self):
        self.enabled = USE_S3_STORAGE and bool(AWS_ACCESS_KEY_ID) and bool(AWS_S3_BUCKET_NAME)
        self._client = None
        if self.enabled:
            try:
                import boto3
                self._client = boto3.client(
                    "s3",
                    region_name=AWS_REGION,
                    aws_access_key_id=AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
                )
                logger.info(f"✅ S3Manager initialized — bucket: {AWS_S3_BUCKET_NAME} region: {AWS_REGION}")
                self._apply_bucket_cors()
            except Exception as e:
                logger.error(f"❌ S3 init failed: {e}")
                self.enabled = False
        else:
            logger.info("ℹ️  S3 disabled — using local storage fallback")

    def _apply_bucket_cors(self):
        """Programmatically set CORS on the S3 bucket so browser PUT/GET requests work from localhost.
        Skip for S3 Express (Directory Buckets) as they do not support PutBucketCors.
        """
        if AWS_S3_BUCKET_NAME.endswith("--x-s3"):
            logger.info("ℹ️  Skipping CORS application for S3 Express bucket (not supported/needed for proxy).")
            return

        cors_config = {
            "CORSRules": [
                {
                    "AllowedHeaders": ["*"],
                    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
                    "AllowedOrigins": [
                        "http://localhost:3000",
                        "http://127.0.0.1:3000",
                        "http://localhost:5173",
                        "http://127.0.0.1:5173",
                        FRONTEND_URL,
                    ],
                    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
                    "MaxAgeSeconds": 3600,
                }
            ]
        }
        try:
            self._client.put_bucket_cors(
                Bucket=AWS_S3_BUCKET_NAME,
                CORSConfiguration=cors_config
            )
            logger.info("✅ S3 bucket CORS policy applied — browser direct uploads enabled")
        except Exception as e:
            logger.warning(f"⚠️  Could not apply bucket CORS (may require s3:PutBucketCORS permission): {e}")

    def build_s3_key(self, dept_name: str, project_id: str, module: str, role: str, version: int, filename: str) -> str:
        """Enterprise hierarchical key: dept/project_id/module/role/vN/YYYY-MM-DD/filename"""
        safe = lambda s: str(s or "unknown").lower().replace(" ", "_").replace("/", "-").replace("\\", "-")
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return f"{safe(dept_name)}/{project_id}/{safe(module)}/{safe(role)}/v{version}/{date_str}/{filename.replace(' ', '_')}"

    def generate_presigned_put_url(self, s3_key: str, content_type: str) -> dict:
        """Return upload info for the client.

        S3 Express (directory buckets, bucket names ending '--x-s3') do NOT support
        CORS config, so a direct browser-to-S3 PUT is impossible.  For these buckets
        we return mode='proxy' so the frontend will multipart-POST to /api/assets/upload-proxy
        and the backend streams the bytes straight to S3 using IAM credentials — no
        browser-to-S3 connection is ever made.

        For standard S3 buckets the old presigned-PUT behaviour is preserved.
        """
        if not self.enabled:
            return {"presigned_url": None, "s3_key": s3_key, "mode": "local", "content_type": content_type}

        # Detect S3 Express directory bucket (suffix --x-s3)
        is_express = AWS_S3_BUCKET_NAME.endswith("--x-s3")
        if is_express:
            logger.info(f"🔁 S3 Express detected — using backend proxy upload (CORS not supported on directory buckets)")
            return {"presigned_url": None, "s3_key": s3_key, "mode": "proxy", "content_type": content_type}

        try:
            url = self._client.generate_presigned_url(
                "put_object",
                Params={"Bucket": AWS_S3_BUCKET_NAME, "Key": s3_key},
                ExpiresIn=S3_PRESIGNED_URL_EXPIRY,
            )
            return {"presigned_url": url, "s3_key": s3_key, "mode": "s3", "content_type": content_type}
        except Exception as e:
            logger.error(f"Presigned PUT URL failed: {e}")
            return {"presigned_url": None, "s3_key": s3_key, "mode": "proxy", "content_type": content_type}

    def upload_bytes_to_s3(self, s3_key: str, data: bytes, content_type: str) -> dict:
        """Server-side streaming upload — used as proxy when S3 Express CORS is unsupported."""
        if not self.enabled:
            return self._local_put(s3_key, data)
        try:
            self._client.put_object(
                Bucket=AWS_S3_BUCKET_NAME,
                Key=s3_key,
                Body=data,
                ContentType=content_type
            )
            logger.info(f"✅ Proxy upload complete → s3://{AWS_S3_BUCKET_NAME}/{s3_key}")
            return {"s3_key": s3_key, "bucket": AWS_S3_BUCKET_NAME, "mode": "s3"}
        except Exception as e:
            logger.error(f"❌ Proxy S3 upload failed: {e}")
            raise HTTPException(500, f"S3 proxy upload failed: {e}")


    def generate_presigned_get_url(self, s3_key: str) -> str:
        """Time-limited private download URL."""
        if not self.enabled:
            return ""
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": AWS_S3_BUCKET_NAME, "Key": s3_key},
                ExpiresIn=S3_PRESIGNED_URL_EXPIRY,
            )
        except Exception as e:
            logger.error(f"Presigned GET URL failed: {e}")
            return ""

    def initiate_multipart_upload(self, s3_key: str, content_type: str) -> str:
        """Start S3 multipart upload for >100MB. Returns upload_id."""
        if not self.enabled:
            return f"local_mp_{uuid.uuid4().hex[:12]}"
        try:
            resp = self._client.create_multipart_upload(
                Bucket=AWS_S3_BUCKET_NAME, Key=s3_key, ContentType=content_type
            )
            return resp["UploadId"]
        except Exception as e:
            raise HTTPException(500, f"Multipart init failed: {e}")

    def generate_presigned_part_url(self, s3_key: str, upload_id: str, part_number: int) -> str:
        """Sign a URL for a single multipart chunk (part_number 1-10000)."""
        if not self.enabled:
            return f"/api/assets/local-chunk/{part_number}"
        try:
            return self._client.generate_presigned_url(
                "upload_part",
                Params={"Bucket": AWS_S3_BUCKET_NAME, "Key": s3_key,
                        "UploadId": upload_id, "PartNumber": part_number},
                ExpiresIn=S3_PRESIGNED_URL_EXPIRY,
            )
        except Exception as e:
            raise HTTPException(500, f"Part URL failed: {e}")

    def complete_multipart_upload(self, s3_key: str, upload_id: str, parts: list) -> dict:
        """Complete multipart with ETags: [{'PartNumber': n, 'ETag': '...'}]"""
        if not self.enabled:
            return {"Location": f"local://{s3_key}", "Key": s3_key}
        try:
            return self._client.complete_multipart_upload(
                Bucket=AWS_S3_BUCKET_NAME, Key=s3_key, UploadId=upload_id,
                MultipartUpload={"Parts": parts},
            )
        except Exception as e:
            raise HTTPException(500, f"Complete multipart failed: {e}")

    def abort_multipart_upload(self, s3_key: str, upload_id: str):
        """Abort and clean up a multipart upload."""
        if not self.enabled:
            return
        try:
            self._client.abort_multipart_upload(Bucket=AWS_S3_BUCKET_NAME, Key=s3_key, UploadId=upload_id)
        except Exception as e:
            logger.warning(f"Abort multipart: {e}")

    def put_object_direct(self, s3_key: str, data: bytes, content_type: str) -> dict:
        """Server-side direct upload (fallback for small files / local mode)."""
        if not self.enabled:
            return self._local_put(s3_key, data)
        try:
            self._client.put_object(Bucket=AWS_S3_BUCKET_NAME, Key=s3_key, Body=data, ContentType=content_type)
            return {"s3_key": s3_key, "bucket": AWS_S3_BUCKET_NAME, "mode": "s3"}
        except Exception as e:
            logger.error(f"S3 direct put failed, falling back to local: {e}")
            return self._local_put(s3_key, data)

    def _local_put(self, path: str, data: bytes) -> dict:
        local_path = os.path.join(LOCAL_STORAGE_PATH, path)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)
        return {"s3_key": path, "mode": "local"}

    def get_object(self, s3_key: str) -> tuple:
        """Retrieve file content (bytes, content_type)."""
        if not self.enabled:
            return self._local_get(s3_key)
        try:
            resp = self._client.get_object(Bucket=AWS_S3_BUCKET_NAME, Key=s3_key)
            return resp["Body"].read(), resp.get("ContentType", "application/octet-stream")
        except Exception as e:
            logger.warning(f"S3 get failed, local fallback: {e}")
            return self._local_get(s3_key)

    def _local_get(self, path: str) -> tuple:
        import mimetypes
        local_path = os.path.join(LOCAL_STORAGE_PATH, path)
        if not os.path.exists(local_path):
            raise HTTPException(404, "File not found")
        with open(local_path, "rb") as f:
            data = f.read()
        mime_type, _ = mimetypes.guess_type(local_path)
        return data, mime_type or "application/octet-stream"

s3_manager = S3Manager()

# ─── CHECKSUM UTILITY ─────────────────────────────────────────────────────────
import hashlib

def compute_checksum(data: bytes) -> str:
    """SHA-256 checksum for duplicate detection."""
    return hashlib.sha256(data).hexdigest()

# ─── LEGACY STORAGE HELPERS (backward compatibility) ──────────────────────────
storage_key = None

def init_storage():
    return "storage_ready"

def put_object(path: str, data: bytes, content_type: str) -> dict:
    return s3_manager.put_object_direct(path, data, content_type)

def get_object_storage(path: str) -> tuple:
    return s3_manager.get_object(path)


async def create_system_notification(department_id: str, title: str, message: str, notification_type: str, action_user: dict):
    query = {"$or": [{"role": "super_admin"}]}
    if department_id:
        query["$or"].append({"department_id": department_id})
    target_users = await db.users.find(query, {"user_id": 1}).to_list(1000)
    
    now = datetime.now(timezone.utc).isoformat()
    notifs = []
    websockets = []
    for u in target_users:
        if u["user_id"] == action_user.get("user_id"):
            continue
        notif = {
            "notification_id": f"notif_{uuid.uuid4().hex[:10]}",
            "user_id": u["user_id"],
            "type": notification_type,
            "title": title,
            "message": message,
            "is_read": False,
            "data": {},
            "created_at": now
        }
        notifs.append(notif)
        websockets.append((u["user_id"], notif))
        
    if notifs:
        await db.notifications.insert_many(notifs)
        for uid, n in websockets:
            await manager.send(uid, {"type": "notification_new", "data": {**n, "_id": None}})

async def log_file_activity(file_id: str, action: str, user_id: str, user_name: str, department_id: str, metadata: dict = None):
    activity_id = f"act_{uuid.uuid4().hex[:10]}"
    await db.file_activities.insert_one({
        "activity_id": activity_id,
        "file_id": file_id,
        "action": action, # 'uploaded', 'downloaded'
        "user_id": user_id,
        "user_name": user_name,
        "department_id": department_id,
        "metadata": metadata or {},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

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
                    if not user.get("is_active", True):
                        raise HTTPException(403, "Account disabled")
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
                    if not user.get("is_active", True):
                        raise HTTPException(403, "Account disabled")
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
                    if not user.get("is_active", True):
                        raise HTTPException(403, "Account disabled")
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
    username: Optional[str] = None
    password: Optional[str] = None
    email: Optional[str] = None

class TransferWorker(BaseModel):
    new_department_id: str
    new_reporting_manager_id: Optional[str] = None

class ResetPasswordReq(BaseModel):
    new_password: Optional[str] = None

# ─── COMMUNICATION MODELS ─────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    chat_id: str
    sender_id: str
    content: str
    type: str = "text" # text, image, file, system
    file_metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    status: str = "sent" # sent, delivered, seen

class ChatRoom(BaseModel):
    chat_id: str
    participants: List[str]
    last_message: Optional[Dict[str, Any]] = None
    unread_counts: Dict[str, int] = {}
    updated_at: str

# ─── WAR ROOM MODELS ──────────────────────────────────────────────────────────
class IdeaVaultModel(BaseModel):
    idea_id: str
    title: str
    problem_statement: str
    solution_overview: str
    target_users: str
    revenue_model: str
    estimated_market_need: str
    monetization_type: str
    business_risk_level: str
    priority_level: str
    innovation_score: int
    tools_required: List[str] = []
    department_id: Optional[str] = None
    author_id: str
    status: str = "draft"
    created_at: str
    updated_at: str

class ArchitectureBlock(BaseModel):
    id: str
    content: str
    type: str = "module"

class ArchitectureModel(BaseModel):
    architecture_id: str
    idea_id: str
    title: str
    template_type: str
    frontend_stack: str
    backend_stack: str
    database_stack: str
    cloud_provider: str
    blocks: List[ArchitectureBlock] = []
    department_id: Optional[str] = None
    author_id: str
    status: str = "draft"
    created_at: str
    updated_at: str

class RoadmapStep(BaseModel):
    id: str
    milestone_name: str
    owner: str
    department_id: str
    budget: float
    start_date: str
    end_date: str
    status: str

class RoadmapModel(BaseModel):
    roadmap_id: str
    idea_id: str
    architecture_id: Optional[str] = None
    title: str
    department_id: Optional[str] = None
    author_id: str
    steps: List[RoadmapStep] = []
    status: str = "draft"
    created_at: str
    updated_at: str

class IdeaCreate(BaseModel):
    title: str
    problem_statement: str
    solution_overview: str
    target_users: str
    revenue_model: str
    estimated_market_need: str
    monetization_type: str
    business_risk_level: str
    priority_level: str
    innovation_score: int
    tools_required: List[str] = []
    department_id: Optional[str] = None
    image_url: Optional[str] = None

class ArchitectureCreate(BaseModel):
    idea_id: str
    title: str
    template_type: str
    frontend_stack: str
    backend_stack: str
    database_stack: str
    cloud_provider: str
    blocks: List[ArchitectureBlock] = []
    department_id: Optional[str] = None
    image_url: Optional[str] = None

class RoadmapCreate(BaseModel):
    idea_id: str
    architecture_id: Optional[str] = None
    title: str
    steps: List[RoadmapStep] = []
    department_id: Optional[str] = None
    image_url: Optional[str] = None

# ─── PROJECT CONTROL ROOM MODELS ──────────────────────────────────────────────
class ProjectMember(BaseModel):
    user_id: str
    role: str # hod, worker, manager
    name: str

class ProjectDependency(BaseModel):
    project_id: str
    description: str

class ProjectCreate(BaseModel):
    name: str
    description: str
    project_type: str
    business_goal: str
    technical_goal: str
    roadmap_description: str
    start_date: str
    deadline: str
    department_id: str
    estimated_budget: float
    allocated_budget: float
    members: List[ProjectMember] = []
    dependencies: List[ProjectDependency] = []
    client_internal: str
    priority: str
    risk_level: str

class ProjectStatusUpdate(BaseModel):
    status: str

class ProjectArchitectureUpdate(BaseModel):
    architecture_diagram: Optional[str] = None
    roadmap_description: Optional[str] = None
    update_notes: Optional[str] = None

class ProjectFileTrace(BaseModel):
    file_id: str
    project_id: str
    department_id: str
    sender_id: str
    sender_role: str
    sender_name: str
    sender_department_name: Optional[str] = None
    receiver_department_id: Optional[str] = None
    module_name: str
    branch_mapping: Optional[str] = None
    environment: str = "development"
    attachment_notes: str
    file_url: str
    file_name: str
    file_size: int
    created_at: str
    file_category: str
    file_path: Optional[str] = None
    version: int = 1

class CompanyKPIs(BaseModel):
    mrr: float
    arr: float
    burn_rate: float
    runway_months: float
    revenue_history: List[Dict[str, Any]]
    expense_history: List[Dict[str, Any]]
    updated_at: str

class AuditLog(BaseModel):
    event_type: str
    user_id: str
    resource_type: str
    resource_id: str
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    timestamp: str

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
        raise HTTPException(400, f"Google OAuth works only when connected to Emergent AI: {e}")

    email = oauth_data["email"].lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user and not user.get("is_active", True):
        raise HTTPException(403, "Account disabled")

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
            raise HTTPException(404, "User record not found")
        if not user.get("is_active", True):
            raise HTTPException(403, "Account disabled")
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
    request: Request,
    file: UploadFile = FastAPIFile(...),
    task_id: Optional[str] = None,
    department_id: Optional[str] = None,
    is_profile: bool = Query(False),
    current_user: dict = Depends(auth_required)
):
    # ── Inline security validation (replaces ClamAV/BullMQ) ──────────────
    data = await file.read()
    client_ip = request.client.host if request.client else "unknown"

    validation = await validate_upload(
        file_bytes=data,
        filename=file.filename,
        content_type=file.content_type,
        user_id=current_user["user_id"],
        client_ip=client_ip,
    )

    file_id = f"file_{uuid.uuid4().hex[:10]}"

    if not validation.passed:
        # Store rejection record — DO NOT upload to S3
        rejected_record = {
            "file_id": file_id,
            "original_filename": file.filename,
            "content_type": file.content_type or "application/octet-stream",
            "size": len(data),
            "uploader_id": current_user["user_id"],
            "uploader_name": current_user["name"],
            "task_id": task_id,
            "department_id": department_id or current_user.get("department_id"),
            "is_profile": is_profile,
            "is_deleted": False,
            "status": "rejected",
            "validationFlags": validation.to_mongo_flags(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.files.insert_one({**rejected_record})
        await log_file_activity(file_id, "rejected", current_user["user_id"], current_user["name"], rejected_record["department_id"], {"filename": file.filename, "reason": validation.reason})
        raise HTTPException(status_code=422, detail={"error": "File rejected by security validation", "reason": validation.reason, "file_id": file_id})

    # ── Validation passed — use safe UUID filename for storage ────────────
    safe_filename = validation.safe_filename
    path = f"{APP_NAME}/uploads/{current_user['user_id']}/{safe_filename}"
    result = put_object(path, data, file.content_type or "application/octet-stream")

    record = {
        "file_id": file_id,
        "storage_path": result.get("s3_key", path),
        "original_filename": file.filename,
        "safe_filename": safe_filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": len(data),
        "uploader_id": current_user["user_id"],
        "uploader_name": current_user["name"],
        "task_id": task_id,
        "department_id": department_id or current_user.get("department_id"),
        "is_profile": is_profile,
        "is_deleted": False,
        "status": "approved",
        "validationFlags": validation.to_mongo_flags(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one({**record})
    await log_file_activity(file_id, "uploaded", current_user["user_id"], current_user["name"], record["department_id"], {"filename": file.filename})
    return {**record, "_id": None}

@api_router.get("/files")
async def get_files(
    task_id: Optional[str] = None,
    department_id: Optional[str] = None,
    current_user: dict = Depends(auth_required)
):
    query = {"is_deleted": False, "is_profile": {"$ne": True}}
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

@api_router.get("/files/history")
async def get_file_history(current_user: dict = Depends(auth_required)):
    # Combine general files and project files activity
    # Rules: workers see their dept history, superadmin sees all
    query = {}
    if current_user["role"] != "super_admin":
        query["department_id"] = current_user.get("department_id")
    
    # We want to return a list of activities with file details joined
    activities = await db.file_activities.find(query, {"_id": 0}).sort("timestamp", -1).to_list(500)
    
    # Enrich with file info (checking both collections)
    enriched = []
    for act in activities:
        file_id = act["file_id"]
        f = await db.files.find_one({"file_id": file_id}, {"_id": 0})
        if not f:
            f = await db.project_files.find_one({"file_id": file_id}, {"_id": 0})
        
        if f:
            enriched.append({
                **act,
                "file_info": {
                    "original_filename": f.get("original_filename") or f.get("file_name"),
                    "content_type": f.get("content_type") or "file",
                    "size": f.get("size") or f.get("file_size")
                }
            })
    return enriched

@api_router.get("/files/{file_id}/download")
async def download_file(file_id: str, current_user: dict = Depends(auth_required)):
    record = await db.files.find_one({"file_id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(404, "File not found")
    if record.get("status") in ["pending", "rejected"]:
        raise HTTPException(403, f"File access denied. Status: {record.get('status')}")
    content, content_type = get_object_storage(record["storage_path"])
    await log_file_activity(file_id, "downloaded", current_user["user_id"], current_user["name"], record.get("department_id"), {"filename": record["original_filename"]})
    return Response(
        content=content,
        media_type=record.get("content_type", content_type),
        headers={"Content-Disposition": f"attachment; filename=\"{record['original_filename']}\""}
    )

@api_router.delete("/files/{file_id}")
async def delete_file(file_id: str, current_user: dict = Depends(auth_required)):
    await db.files.update_one({"file_id": file_id}, {"$set": {"is_deleted": True}})
    return {"message": "Deleted"}

# ─── CHAT ROUTES ──────────────────────────────────────────────────────────────

@api_router.get("/chat/contacts")
async def get_chat_contacts(current_user: dict = Depends(auth_required)):
    """Return allowed contacts for chat based on hierarchical RBAC"""
    role = current_user["role"]
    dept_id = current_user.get("department_id")
    
    if role == "super_admin":
        # Superadmin sees everyone
        users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    elif role == "hod":
        # HOD sees Superadmins AND workers of their OWN department
        users = await db.users.find({
            "$or": [
                {"role": "super_admin"},
                {"department_id": dept_id}
            ]
        }, {"_id": 0, "password_hash": 0}).to_list(1000)
    else: # worker
        # Worker sees Superadmins, OWN HOD, AND same-dept workers
        users = await db.users.find({
            "$or": [
                {"role": "super_admin"},
                {"$and": [{"role": "hod"}, {"department_id": dept_id}]},
                {"$and": [{"role": "worker"}, {"department_id": dept_id}]}
            ]
        }, {"_id": 0, "password_hash": 0}).to_list(1000)
        
    # Enrich with online presence and remove self
    result = []
    for u in users:
        if u["user_id"] == current_user["user_id"]:
            continue
        u["is_online"] = manager.is_online(u["user_id"])
        result.append(u)
    return result

def is_chat_allowed(sender: dict, receiver: dict) -> bool:
    """RBAC: determines if sender is allowed to message receiver"""
    sr = sender.get("role", "")
    rr = receiver.get("role", "")
    sd = sender.get("department_id")
    rd = receiver.get("department_id")
    if sr == "super_admin" or rr == "super_admin":
        return True
    if sr == "hod" and rr in ("worker", "hod"):
        return sd == rd
    if sr == "worker" and rr == "hod":
        return sd == rd
    if sr == "worker" and rr == "worker":
        return sd == rd
    return False

@api_router.get("/chat/threads")
async def get_chat_threads(current_user: dict = Depends(auth_required)):
    """Sidebar threads with other_user info + unread_count"""
    user_id = current_user["user_id"]
    rooms = await db.chats.find(
        {"participants": user_id},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    enriched = []
    for room in rooms:
        other_id = next((p for p in room["participants"] if p != user_id), None)
        if not other_id:
            continue
        other_user = await db.users.find_one({"user_id": other_id}, {"_id": 0, "password_hash": 0})
        if not other_user:
            continue
        other_user["is_online"] = manager.is_online(other_id)
        enriched.append({
            **room,
            "other_user": other_user,
            "unread_count": room.get("unread_counts", {}).get(user_id, 0)
        })
    return enriched

@api_router.post("/chat/mark-seen/{other_user_id}")
async def mark_seen(other_user_id: str, current_user: dict = Depends(auth_required)):
    """Mark all messages from other_user as seen and notify sender via WS"""
    user_id = current_user["user_id"]
    chat_id = "_".join(sorted([user_id, other_user_id]))
    result = await db.messages.update_many(
        {"chat_id": chat_id, "receiver_id": user_id, "status": {"$in": ["sent", "delivered"]}},
        {"$set": {"status": "seen"}}
    )
    await db.chats.update_one(
        {"chat_id": chat_id},
        {"$set": {f"unread_counts.{user_id}": 0}}
    )
    if result.modified_count > 0:
        await manager.send(other_user_id, {
            "type": "messages_seen",
            "chat_id": chat_id,
            "seen_by": user_id
        })
    return {"marked": result.modified_count}

@api_router.delete("/chat/messages/{message_id}")
async def delete_message(
    message_id: str,
    delete_for: str = Query("me", enum=["me", "everyone"]),
    current_user: dict = Depends(auth_required)
):
    """Delete message for self or everyone"""
    msg = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    if delete_for == "everyone":
        if msg["sender_id"] != current_user["user_id"]:
            raise HTTPException(403, "Can only delete your own messages for everyone")
        await db.messages.update_one(
            {"message_id": message_id},
            {"$set": {"content": None, "deleted_for_everyone": True, "file_metadata": None}}
        )
        await manager.send(msg["receiver_id"], {
            "type": "message_deleted",
            "message_id": message_id,
            "chat_id": msg["chat_id"],
            "delete_for": "everyone"
        })
    else:
        await db.messages.update_one(
            {"message_id": message_id},
            {"$addToSet": {"deleted_for": current_user["user_id"]}}
        )
    return {"status": "deleted"}

@api_router.post("/chat/messages/{message_id}/pin")
async def pin_message(message_id: str, current_user: dict = Depends(auth_required)):
    """Toggle pin on a message"""
    msg = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Message not found")
    new_pinned = not msg.get("is_pinned", False)
    await db.messages.update_one({"message_id": message_id}, {"$set": {"is_pinned": new_pinned}})
    for uid in [msg["sender_id"], msg["receiver_id"]]:
        await manager.send(uid, {"type": "message_pinned", "message_id": message_id, "chat_id": msg["chat_id"], "is_pinned": new_pinned})
    return {"is_pinned": new_pinned}

@api_router.get("/chat/history/{other_user_id}")
async def get_chat_history(other_user_id: str, current_user: dict = Depends(auth_required)):
    """Fetch private 1-to-1 conversation history"""
    user_id = current_user["user_id"]
    # Chat ID is always sorted user IDs to ensure uniqueness for private chat
    chat_id = "_".join(sorted([user_id, other_user_id]))
    
    messages = await db.messages.find(
        {
            "chat_id": chat_id,
            "deleted_for": {"$not": {"$elemMatch": {"$eq": user_id}}}
        },
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    
    # Mark received messages as seen
    await db.messages.update_many(
        {"chat_id": chat_id, "receiver_id": user_id, "status": {"$in": ["sent", "delivered"]}},
        {"$set": {"status": "seen"}}
    )
    # Reset unread count for current user
    await db.chats.update_one(
        {"chat_id": chat_id},
        {"$set": {f"unread_counts.{user_id}": 0}}
    )
    
    return messages

@api_router.get("/chat/rooms")
async def get_chat_rooms(current_user: dict = Depends(auth_required)):
    """Get all active chat rooms for current user"""
    user_id = current_user["user_id"]
    rooms = await db.chats.find(
        {"participants": user_id},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    return rooms

# ─── WAR ROOM ROUTES ──────────────────────────────────────────────────────────

async def _attach_author_names(docs):
    uids = list({d.get("author_id") for d in docs if d.get("author_id")})
    users = await db.users.find({"user_id": {"$in": uids}}, {"user_id": 1, "full_name": 1, "role": 1}).to_list(1000)
    umap = {u["user_id"]: u.get("full_name", u.get("role", "Unknown User")) for u in users}
    for d in docs: d["author_name"] = umap.get(d.get("author_id"), "Unknown User")
    return docs

@api_router.get("/war-room/ideas")
async def get_ideas(current_user: dict = Depends(auth_required)):
    query = {}
    if current_user["role"] in ["worker", "hod"]:
        query["department_id"] = current_user.get("department_id")
    ideas = await db.ideas.find(query, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return await _attach_author_names(ideas)

@api_router.post("/war-room/ideas")
async def create_idea(data: IdeaCreate, current_user: dict = Depends(auth_required)):
    if current_user["role"] != "super_admin": data.department_id = current_user.get("department_id")
    if not data.department_id: data.department_id = current_user.get("department_id")
    
    idea_id = f"idea_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "idea_id": idea_id,
        "author_id": current_user["user_id"],
        "status": "submitted",
        "created_at": now,
        "updated_at": now,
        **data.dict()
    }
    await db.ideas.insert_one(record)
    user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
    await manager.broadcast(list(manager.connections.keys()), {"type": "war_room_feed_activity", "data": {"type": "Idea", "title": data.title, "action": "created by", "user": user_name}})
    await create_system_notification(record.get("department_id"), "New Idea Validated", f"{user_name} added idea: {data.title}", "war_room_activity", current_user)
    return {**record, "_id": None}

@api_router.put("/war-room/ideas/{idea_id}")
async def update_idea(idea_id: str, data: IdeaCreate, current_user: dict = Depends(auth_required)):
    # ── RBAC: Workers are read-only; HODs and Super Admins can update ──
    if current_user["role"] == "worker":
        raise HTTPException(403, "Workers cannot modify Idea Vault records")
    idea = await db.ideas.find_one({"idea_id": idea_id})
    if not idea: raise HTTPException(404, "Idea not found")
    if current_user["role"] == "hod" and idea.get("department_id") != current_user.get("department_id"):
        raise HTTPException(403, "Not your department")
    update_data = data.dict()
    if current_user["role"] != "super_admin": update_data["department_id"] = idea.get("department_id")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.ideas.update_one({"idea_id": idea_id}, {"$set": update_data})
    user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
    await manager.broadcast(list(manager.connections.keys()), {"type": "war_room_feed_activity", "data": {"type": "Idea", "title": data.title, "action": "updated by", "user": user_name}})
    await create_system_notification(update_data.get("department_id", idea.get("department_id")), "Idea Updated", f"{user_name} updated idea: {data.title}", "war_room_activity", current_user)
    return {"status": "updated"}

@api_router.delete("/war-room/ideas/{idea_id}")
async def delete_idea(idea_id: str, current_user: dict = Depends(auth_required)):
    # ── RBAC: Only Super Admin can delete execution pipeline records ──
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Only Super Admins can delete Idea Vault records")
    idea = await db.ideas.find_one({"idea_id": idea_id})
    if not idea: raise HTTPException(404, "Idea not found")
    await db.ideas.delete_one({"idea_id": idea_id})
    user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
    await manager.broadcast(list(manager.connections.keys()), {"type": "war_room_feed_activity", "data": {"type": "Idea", "title": idea.get('title'), "action": "deleted by", "user": user_name}})
    await create_system_notification(idea.get("department_id"), "Idea Removed", f"{user_name} deleted idea: {idea.get('title')}", "war_room_activity", current_user)
    return {"status": "deleted"}

@api_router.get("/war-room/architectures")
async def get_architectures(current_user: dict = Depends(auth_required)):
    query = {}
    if current_user["role"] in ["worker", "hod"]:
        query["department_id"] = current_user.get("department_id")
    archs = await db.architectures.find(query, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return await _attach_author_names(archs)

@api_router.post("/war-room/architectures")
async def create_architecture(data: ArchitectureCreate, current_user: dict = Depends(auth_required)):
    if current_user["role"] != "super_admin": data.department_id = current_user.get("department_id")
    if not data.department_id: data.department_id = current_user.get("department_id")
        
    arch_id = f"arch_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "architecture_id": arch_id,
        "author_id": current_user["user_id"],
        "status": "draft",
        "created_at": now,
        "updated_at": now,
        "blocks": [b.dict() for b in data.blocks],
        "idea_id": data.idea_id,
        "title": data.title,
        "template_type": data.template_type,
        "frontend_stack": data.frontend_stack,
        "backend_stack": data.backend_stack,
        "database_stack": data.database_stack,
        "cloud_provider": data.cloud_provider,
        "department_id": data.department_id
    }
    await db.architectures.insert_one(record)
    user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
    await manager.broadcast(list(manager.connections.keys()), {"type": "war_room_feed_activity", "data": {"type": "Architecture", "title": data.title, "action": "created by", "user": user_name}})
    await create_system_notification(record.get("department_id"), "Architecture Created", f"{user_name} mapped architecture: {data.title}", "war_room_activity", current_user)
    return {**record, "_id": None}

@api_router.put("/war-room/architectures/{architecture_id}")
async def update_architecture(architecture_id: str, data: ArchitectureCreate, current_user: dict = Depends(auth_required)):
    # ── RBAC: Workers are read-only; HODs and Super Admins can update ──
    if current_user["role"] == "worker":
        raise HTTPException(403, "Workers cannot modify Architecture records")
    arch = await db.architectures.find_one({"architecture_id": architecture_id})
    if not arch: raise HTTPException(404, "Architecture not found")
    if current_user["role"] == "hod" and arch.get("department_id") != current_user.get("department_id"):
        raise HTTPException(403, "Not your department")
    update_data = {
        "blocks": [b.dict() for b in data.blocks],
        "idea_id": data.idea_id,
        "title": data.title,
        "template_type": data.template_type,
        "frontend_stack": data.frontend_stack,
        "backend_stack": data.backend_stack,
        "database_stack": data.database_stack,
        "cloud_provider": data.cloud_provider,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if current_user["role"] != "super_admin": update_data["department_id"] = arch.get("department_id")
    else: update_data["department_id"] = data.department_id or arch.get("department_id")
    await db.architectures.update_one({"architecture_id": architecture_id}, {"$set": update_data})
    user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
    await manager.broadcast(list(manager.connections.keys()), {"type": "war_room_feed_activity", "data": {"type": "Architecture", "title": data.title, "action": "updated by", "user": user_name}})
    await create_system_notification(update_data.get("department_id", arch.get("department_id")), "Architecture Updated", f"{user_name} modified architecture: {data.title}", "war_room_activity", current_user)
    return {"status": "updated"}

@api_router.delete("/war-room/architectures/{architecture_id}")
async def delete_architecture(architecture_id: str, current_user: dict = Depends(auth_required)):
    # ── RBAC: Only Super Admin can delete execution pipeline records ──
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Only Super Admins can delete Architecture records")
    arch = await db.architectures.find_one({"architecture_id": architecture_id})
    if not arch: raise HTTPException(404, "Architecture not found")
    await db.architectures.delete_one({"architecture_id": architecture_id})
    user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
    await manager.broadcast(list(manager.connections.keys()), {"type": "war_room_feed_activity", "data": {"type": "Architecture", "title": arch.get('title'), "action": "deleted by", "user": user_name}})
    await create_system_notification(arch.get("department_id"), "Architecture Removed", f"{user_name} removed architecture: {arch.get('title')}", "war_room_activity", current_user)
    return {"status": "deleted"}

@api_router.get("/war-room/roadmaps")
async def get_roadmaps(current_user: dict = Depends(auth_required)):
    query = {}
    if current_user["role"] in ["worker", "hod"]:
        query["department_id"] = current_user.get("department_id")
    rms = await db.roadmaps.find(query, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return await _attach_author_names(rms)

@api_router.post("/war-room/roadmaps")
async def create_roadmap(data: RoadmapCreate, current_user: dict = Depends(auth_required)):
    if current_user["role"] != "super_admin": data.department_id = current_user.get("department_id")
    if not data.department_id: data.department_id = current_user.get("department_id")
        
    rm_id = f"rm_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    record = {
        "roadmap_id": rm_id,
        "author_id": current_user["user_id"],
        "status": "active",
        "created_at": now,
        "updated_at": now,
        "steps": [s.dict() for s in data.steps],
        "idea_id": data.idea_id,
        "architecture_id": data.architecture_id,
        "title": data.title,
        "department_id": data.department_id
    }
    await db.roadmaps.insert_one(record)
    user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
    await manager.broadcast(list(manager.connections.keys()), {"type": "war_room_feed_activity", "data": {"type": "Roadmap", "title": data.title, "action": "created by", "user": user_name}})
    await create_system_notification(record.get("department_id"), "Roadmap Created", f"{user_name} defined roadmap: {data.title}", "war_room_activity", current_user)
    return {**record, "_id": None}

@api_router.put("/war-room/roadmaps/{roadmap_id}")
async def update_roadmap(roadmap_id: str, data: RoadmapCreate, current_user: dict = Depends(auth_required)):
    # ── RBAC: Workers are read-only; HODs and Super Admins can update ──
    if current_user["role"] == "worker":
        raise HTTPException(403, "Workers cannot modify Roadmap records")
    rm = await db.roadmaps.find_one({"roadmap_id": roadmap_id})
    if not rm: raise HTTPException(404, "Roadmap not found")
    if current_user["role"] == "hod" and rm.get("department_id") != current_user.get("department_id"):
        raise HTTPException(403, "Not your department")
    update_data = {
        "steps": [s.dict() for s in data.steps],
        "idea_id": data.idea_id,
        "architecture_id": data.architecture_id,
        "title": data.title,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "department_id": data.department_id if current_user["role"] == "super_admin" else rm.get("department_id")
    }
    await db.roadmaps.update_one({"roadmap_id": roadmap_id}, {"$set": update_data})
    user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
    await manager.broadcast(list(manager.connections.keys()), {"type": "war_room_feed_activity", "data": {"type": "Roadmap", "title": data.title, "action": "updated by", "user": user_name}})
    await create_system_notification(update_data.get("department_id", rm.get("department_id")), "Roadmap Updated", f"{user_name} updated roadmap: {data.title}", "war_room_activity", current_user)
    return {"status": "updated"}

@api_router.delete("/war-room/roadmaps/{roadmap_id}")
async def delete_roadmap(roadmap_id: str, current_user: dict = Depends(auth_required)):
    # ── RBAC: Only Super Admin can delete execution pipeline records ──
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Only Super Admins can delete Roadmap records")
    rm = await db.roadmaps.find_one({"roadmap_id": roadmap_id})
    if not rm: raise HTTPException(404, "Roadmap not found")
    await db.roadmaps.delete_one({"roadmap_id": roadmap_id})
    user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
    await manager.broadcast(list(manager.connections.keys()), {"type": "war_room_feed_activity", "data": {"type": "Roadmap", "title": rm.get('title'), "action": "deleted by", "user": user_name}})
    await create_system_notification(rm.get("department_id"), "Roadmap Removed", f"{user_name} removed roadmap: {rm.get('title')}", "war_room_activity", current_user)
    return {"status": "deleted"}

@api_router.get("/war-room/financials")
async def get_financials(current_user: dict = Depends(auth_required)):
    """Executive only financial data"""
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Only Superadmins can view financial KPIs")
    
    financials = await db.financials.find_one({}, {"_id": 0})
    if not financials:
        return {
            "mrr": 45000.0,
            "arr": 540000.0,
            "burn_rate": 15000.0,
            "runway_months": 12.5,
            "revenue_history": [],
            "expense_history": [],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
    return financials

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
    if current_user["role"] == "super_admin":
        query = {}
    else:
        query = {"$or": [
            {"organizer_id": current_user["user_id"]},
            {"attendee_ids": current_user["user_id"]}
        ]}
    meetings = await db.meetings.find(query, {"_id": 0}).sort("start_time", 1).to_list(200)
    return meetings

@api_router.post("/meetings")
async def create_meeting(data: MeetingCreate, current_user: dict = Depends(auth_required)):
    if current_user["role"] == "worker":
        raise HTTPException(403, "Workers cannot create meetings. Only Super Admins and HODs can schedule meetings.")
    # Block past-date meetings
    try:
        start_dt = datetime.fromisoformat(data.start_time.replace("Z", "+00:00"))
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        if start_dt < datetime.now(timezone.utc):
            raise HTTPException(400, "Meeting start time cannot be in the past. Please choose a future date and time.")
    except ValueError:
        raise HTTPException(400, "Invalid start_time format.")
    meeting_id = f"mtg_{uuid.uuid4().hex[:10]}"
    meeting = {
        "meeting_id": meeting_id,
        "title": data.title,
        "description": data.description,
        "organizer_id": current_user["user_id"],
        "organizer_name": current_user["name"],
        "organizer_role": current_user["role"],
        "attendee_ids": data.attendee_ids,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "department_id": data.department_id or current_user.get("department_id"),
        "notes": data.notes,
        "status": "scheduled",  # scheduled | cancelled
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

@api_router.put("/meetings/{meeting_id}/cancel")
async def cancel_meeting(meeting_id: str, current_user: dict = Depends(auth_required)):
    """Suspend / cancel a meeting. Super admin or the organizer (hod) only."""
    if current_user["role"] == "worker":
        raise HTTPException(403, "Workers cannot cancel meetings.")
    meeting = await db.meetings.find_one({"meeting_id": meeting_id}, {"_id": 0})
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if current_user["role"] == "hod" and meeting.get("organizer_id") != current_user["user_id"]:
        raise HTTPException(403, "You can only cancel meetings you created.")
    await db.meetings.update_one({"meeting_id": meeting_id}, {"$set": {"status": "cancelled"}})
    return {"meeting_id": meeting_id, "status": "cancelled"}

@api_router.put("/meetings/{meeting_id}")
async def update_meeting(meeting_id: str, data: MeetingUpdate, current_user: dict = Depends(auth_required)):
    if current_user["role"] == "worker":
        raise HTTPException(403, "Workers cannot update meetings.")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        await db.meetings.update_one({"meeting_id": meeting_id}, {"$set": update})
    return await db.meetings.find_one({"meeting_id": meeting_id}, {"_id": 0})

@api_router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, current_user: dict = Depends(auth_required)):
    if current_user["role"] == "worker":
        raise HTTPException(403, "Workers cannot delete meetings.")
    meeting = await db.meetings.find_one({"meeting_id": meeting_id}, {"_id": 0})
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    if current_user["role"] == "hod" and meeting.get("organizer_id") != current_user["user_id"]:
        raise HTTPException(403, "You can only delete meetings you created.")
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
        if not EMERGENT_KEY:
            response = "AI Copilot is currently disabled. Please add a standard LLM backend API (like OpenAI) to enable this feature."
        else:
            # Replaced Emergent AI logic. User can integrate their custom AI Chatbot logic here.
            response = "This is a placeholder for your custom AI Chatbot API. The emergent AI dependency has been completely removed."
            
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        response = "AI service is temporarily unavailable securely running in offline mode."

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
    
    # Restrict username/password/email changes to Super Admin only
    if "username" in update or "password" in update or "email" in update:
        if current_user["role"] != "super_admin":
            update.pop("username", None)
            update.pop("password", None)
            update.pop("email", None)
        else:
            if "password" in update:
                update["password_hash"] = hash_password(update.pop("password"))
                update["is_temp_password"] = True
            if "email" in update:
                existing = await db.users.find_one({"email": update["email"]})
                if existing and existing["user_id"] != user_id:
                    raise HTTPException(400, "Email already in use")

    if update:
        await db.users.update_one({"user_id": user_id}, {"$set": update})
    return await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})

@api_router.put("/users/{user_id}/suspend")
async def suspend_user(user_id: str, current_user: dict = Depends(auth_required)):
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Super admin only")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    new_status = not user.get("is_active", True)
    await db.users.update_one({"user_id": user_id}, {"$set": {"is_active": new_status}})
    return {"user_id": user_id, "is_active": new_status}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(auth_required)):
    """Delete a user permanently. Super admin only. Cannot delete yourself."""
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Only Super Admins can delete users")
    if current_user["user_id"] == user_id:
        raise HTTPException(400, "You cannot delete your own account")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    await db.users.delete_one({"user_id": user_id})
    # Also clean up any tasks assigned to this user
    await db.tasks.update_many({"assignee_id": user_id}, {"$set": {"assignee_id": None}})
    return {"message": f"User {user_id} deleted successfully"}

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
# Moved to bottom to avoid router conflicts

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

    # ─── SEED ENTERPRISE DATA ─────────────────────────────────────────────────
    
    # 1. Financials
    await db.financials.insert_one({
        "mrr": 45000.0,
        "arr": 540000.0,
        "burn_rate": 15000.0,
        "runway_months": 12.5,
        "revenue_history": [
            {"month": "Jan", "value": 32000},
            {"month": "Feb", "value": 35000},
            {"month": "Mar", "value": 38000},
            {"month": "Apr", "value": 45000}
        ],
        "expense_history": [
            {"month": "Jan", "value": 12000},
            {"month": "Feb", "value": 13000},
            {"month": "Mar", "value": 14000},
            {"month": "Apr", "value": 15000}
        ],
        "updated_at": now.isoformat()
    })

    # 2. War Room Docs
    docs = [
        {
            "doc_id": "doc_idea_01",
            "type": "idea",
            "title": "AI-Powered Fleet Management",
            "content": "### Problem Statement\nLogistics companies struggle with idle time and fuel efficiency.\n\n### The Idea\nUse real-time GPS data and LLMs to optimize route planning on the fly.",
            "category": "Logistics",
            "author_id": admin_uid,
            "status": "validated",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        },
        {
            "doc_id": "doc_arch_01",
            "type": "architecture",
            "title": "System Design: Messaging Hub",
            "content": "graph TD\n    A[Client] -->|WebSocket| B(FastAPI Router)\n    B -->|Pub/Sub| C{Redis}\n    C --> D[MongoDB]\n    D --> E[S3 Storage]",
            "category": "Engineering",
            "author_id": admin_uid,
            "department_id": "dept_engineering",
            "status": "final",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
    ]
    await db.war_room_docs.insert_many(docs)

    # 3. Sample Chat Room
    sarah_uid = uid_map["sarah.miller@teamOS.com"]
    chat_id = "_".join(sorted([admin_uid, sarah_uid]))
    await db.chats.insert_one({
        "chat_id": chat_id,
        "participants": [admin_uid, sarah_uid],
        "last_message": {
            "content": "The new dashboard looks ready for HOD review.",
            "sender_id": admin_uid,
            "created_at": now.isoformat()
        },
        "unread_counts": {sarah_uid: 1},
        "updated_at": now.isoformat()
    })
    
    await db.messages.insert_one({
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "chat_id": chat_id,
        "sender_id": admin_uid,
        "receiver_id": sarah_uid,
        "content": "The new dashboard looks ready for HOD review.",
        "type": "text",
        "status": "sent",
        "created_at": now.isoformat()
    })


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

# ─── PROJECT CONTROL ROOM ROUTES ──────────────────────────────────────────────
@api_router.post("/control-room/projects")
async def create_project(data: ProjectCreate, current_user: dict = Depends(auth_required)):
    if current_user["role"] not in ["super_admin", "hod"]:
        raise HTTPException(403, "Forbidden: Only SuperAdmins and HODs can create projects")
        
    dept = await db.departments.find_one({"department_id": data.department_id}, {"_id": 0})
    dept_prefix = dept["name"][:3].upper() if dept else "GEN"
    type_prefix = data.project_type[:4].upper()
    year = datetime.now(timezone.utc).year
    
    # Generate sequential unique ID
    count = await db.projects.count_documents({"department_id": data.department_id})
    sequence = str(count + 1).zfill(4)
    project_id = f"{dept_prefix}-{type_prefix}-{year}-{sequence}"
    
    now = datetime.now(timezone.utc).isoformat()
    project = {
        "project_id": project_id,
        "name": data.name,
        "description": data.description,
        "project_type": data.project_type,
        "business_goal": data.business_goal,
        "technical_goal": data.technical_goal,
        "roadmap_description": data.roadmap_description,
        "start_date": data.start_date,
        "deadline": data.deadline,
        "department_id": data.department_id,
        "estimated_budget": data.estimated_budget,
        "allocated_budget": data.allocated_budget,
        "members": [m.model_dump() for m in data.members],
        "dependencies": [d.model_dump() for d in data.dependencies],
        "client_internal": data.client_internal,
        "priority": data.priority,
        "risk_level": data.risk_level,
        "status": "In Progress",
        "architecture_diagram": None,
        "architecture_history": [],
        "created_at": now,
        "updated_at": now,
        "creator_id": current_user["user_id"]
    }
    
    await db.projects.insert_one({**project})
    
    # Websocket broadcast to department users and super_admins
    dept_users = await db.users.find({
        "$or": [{"department_id": data.department_id}, {"role": "super_admin"}]
    }, {"user_id": 1}).to_list(1000)
    
    await manager.broadcast(
        [u["user_id"] for u in dept_users], 
        {"type": "project_created", "project": {**project, "_id": None}}
    )
    user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
    await create_system_notification(data.department_id, "Project Assembled", f"{user_name} launched project: {data.name}", "control_room_activity", current_user)
    
    return {**project, "_id": None}

@api_router.get("/control-room/projects")
async def get_projects(department_id: Optional[str] = None, current_user: dict = Depends(auth_required)):
    query = {}
    
    if current_user["role"] == "super_admin":
        if department_id:
            query["department_id"] = department_id
    elif current_user["role"] == "hod":
        query["department_id"] = current_user.get("department_id")
    elif current_user["role"] == "worker":
        query["department_id"] = current_user.get("department_id")
         
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return projects

@api_router.put("/control-room/projects/{project_id}/status")
async def update_project_status(project_id: str, data: ProjectStatusUpdate, current_user: dict = Depends(auth_required)):
    if current_user["role"] not in ["super_admin", "hod"]:
        raise HTTPException(403, "Forbidden")
        
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": data.status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    p = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if p:
        dept_users = await db.users.find({"department_id": p.get("department_id")}, {"user_id": 1}).to_list(1000)
        await manager.broadcast([u["user_id"] for u in dept_users], {
            "type": "project_status_changed", 
            "project_id": project_id, 
            "status": data.status
        })
        user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
        await create_system_notification(p.get("department_id"), "Project Status Changed", f"{user_name} updated status to {data.status}", "control_room_activity", current_user)
    return p

@api_router.put("/control-room/projects/{project_id}/architecture")
async def update_project_architecture(project_id: str, data: ProjectArchitectureUpdate, current_user: dict = Depends(auth_required)):
    if current_user["role"] not in ["super_admin", "hod"]:
        raise HTTPException(403, "Forbidden")
        
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(404, "Project not found")

    # Snapshot current state before update
    history_entry = {
        "architecture_diagram": project.get("architecture_diagram"),
        "roadmap_description": project.get("roadmap_description"),
        "update_notes": data.update_notes or "Regular Update",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by_name": current_user["name"],
        "version": len(project.get("architecture_history", [])) + 1
    }

    await db.projects.update_one(
        {"project_id": project_id},
        {
            "$set": {
                "architecture_diagram": data.architecture_diagram,
                "roadmap_description": data.roadmap_description,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "$push": {
                "architecture_history": history_entry
            }
        }
    )
    
    p = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if p:
        dept_users = await db.users.find({
            "$or": [{"department_id": p.get("department_id")}, {"role": "super_admin"}]
        }, {"user_id": 1}).to_list(1000)
        
        await manager.broadcast([u["user_id"] for u in dept_users], {
            "type": "project_architecture_updated",
            "project": p
        })
        user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
        await create_system_notification(p.get("department_id"), "Project Architecture Updated", f"{user_name} pushed new architecture trace", "control_room_activity", current_user)
    return p

@api_router.delete("/control-room/projects/{project_id}")
async def delete_project(project_id: str, current_user: dict = Depends(auth_required)):
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Forbidden: Only SuperAdmins can delete projects")
    
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(404, "Project not found")
        
    await db.projects.delete_one({"project_id": project_id})
    # Also cleanup project-specific files metadata
    await db.project_files.delete_many({"project_id": project_id})
    
    user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
    await create_system_notification(project.get("department_id"), "Project Terminated", f"{user_name} deleted project: {project.get('name')}", "control_room_activity", current_user)
    
    # Broadcast deletion
    dept_id = project.get("department_id")
    dept_users = await db.users.find({
        "$or": [{"department_id": dept_id}, {"role": "super_admin"}]
    }, {"user_id": 1}).to_list(1000)
    
    await manager.broadcast(
        [u["user_id"] for u in dept_users], 
        {"type": "project_deleted", "project_id": project_id}
    )
    
    return {"message": "Project deleted successfully"}

@api_router.get("/control-room/projects/{project_id}/files")

async def get_project_files(project_id: str, current_user: dict = Depends(auth_required)):
    files = await db.project_files.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return files

@api_router.post("/control-room/files")
async def upload_project_file(
    request: Request,
    project_id: str = Query(...),
    department_id: str = Query(...),
    module_name: str = Query(...),
    branch_mapping: str = Query(""),
    environment: str = Query("development"),
    attachment_notes: str = Query(""),
    receiver_department_id: str = Query(""),
    file_category: str = Query("Other"),
    file_path: str = Query(""),
    version: int = Query(1),
    file: UploadFile = FastAPIFile(...),
    current_user: dict = Depends(auth_required)
):
    try:
        content = await file.read()
        client_ip = request.client.host if request.client else "unknown"

        # ── Inline security validation ──────────────────────────────────────────
        validation = await validate_upload(
            file_bytes=content,
            filename=file.filename or "unknown",
            content_type=file.content_type,
            user_id=current_user["user_id"],
            client_ip=client_ip,
        )
        if not validation.passed:
            raise HTTPException(status_code=422, detail={"error": "File rejected by security validation", "reason": validation.reason})

        file_id = f"file_{uuid.uuid4().hex[:12]}"
        storage_path = f"control_room/{project_id}/{validation.safe_filename}"
        url_info = put_object(storage_path, content, file.content_type)
        
        now = datetime.now(timezone.utc).isoformat()
        
        # Get sender department name safely
        sender_dept_record = await db.departments.find_one({"department_id": department_id}, {"_id": 0, "name": 1})
        sender_dept_name = sender_dept_record["name"] if sender_dept_record else department_id

        file_record = {
            "file_id": file_id,
            "project_id": project_id,
            "department_id": department_id,
            "sender_id": current_user["user_id"],
            "sender_role": current_user["role"],
            "sender_name": current_user["name"],
            "sender_department_name": sender_dept_name,
            "receiver_department_id": receiver_department_id or None,
            "module_name": module_name,
            "branch_mapping": branch_mapping,
            "environment": environment,
            "attachment_notes": attachment_notes,
            "file_url": storage_path,
            "file_name": file.filename,
            "file_size": len(content),
            "created_at": now,
            "file_category": file_category,
            "file_path": file_path,
            "version": version
        }
        
        file_record["status"] = "approved"
        file_record["validationFlags"] = validation.to_mongo_flags()
        await db.project_files.insert_one({**file_record})
        
        # Broadcast trace event
        target_query = {"department_id": receiver_department_id} if receiver_department_id else {"department_id": department_id}
        target_users = await db.users.find(target_query, {"user_id": 1}).to_list(1000)
        
        await manager.broadcast([u["user_id"] for u in target_users], {
             "type": "project_file_uploaded",
             "file": {**file_record, "_id": None}
        })
        await log_file_activity(file_id, "uploaded", current_user["user_id"], current_user["name"], file_record["department_id"], {"filename": file.filename, "project_id": project_id})
        user_name = current_user.get("name", current_user.get("full_name", current_user["role"]))
        await create_system_notification(file_record["department_id"], "Trace File Uploaded", f"{user_name} transmitted {file_record['module_name']}", "control_room_activity", current_user)
        
        return {**file_record, "_id": None}
    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        raise HTTPException(500, f"Upload failed: {str(e)}")

@api_router.get("/control-room/files/{file_id}/download")
async def download_project_file(file_id: str, current_user: dict = Depends(auth_required)):
    record = await db.project_files.find_one({"file_id": file_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Project trace file not found")
    content, content_type = get_object_storage(record["file_url"])
    await log_file_activity(file_id, "downloaded", current_user["user_id"], current_user["name"], record.get("department_id"), {"filename": record["file_name"], "project_id": record.get("project_id")})
    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename=\"{record['file_name']}\""}
    )

# ═══════════════════════════════════════════════════════════════════════════════
# 🧠 PROJECT ASSET INTELLIGENCE & TRACEABILITY STORAGE ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

# ─── ASSET PYDANTIC MODELS ────────────────────────────────────────────────────

class UploadSessionCreate(BaseModel):
    project_id: str
    department_id: str
    module_name: str
    file_name: str
    file_size: int
    mime_type: str
    version: int = 1
    linked_chat_thread: Optional[str] = None
    linked_roadmap_step: Optional[str] = None
    linked_architecture_block: Optional[str] = None
    linked_deployment_stage: Optional[str] = None
    repository_branch: str = "main"
    environment: str = "development"
    upload_source_screen: str = "project_dashboard"
    worker_task_id: Optional[str] = None
    receiver_department_id: Optional[str] = None
    tags: List[str] = []
    comments: str = ""
    file_category: str = "Other"
    attachment_notes: str = ""
    # AI-ready metadata
    project_intent: Optional[str] = None
    architecture_type: Optional[str] = None

class MultipartInitRequest(BaseModel):
    project_id: str
    department_id: str
    module_name: str
    file_name: str
    file_size: int
    mime_type: str
    total_parts: int
    version: int = 1
    linked_chat_thread: Optional[str] = None
    linked_roadmap_step: Optional[str] = None
    linked_deployment_stage: Optional[str] = None
    repository_branch: str = "main"
    environment: str = "development"
    file_category: str = "Other"
    tags: List[str] = []

class MultipartPartRequest(BaseModel):
    part_number: int

class MultipartCompleteRequest(BaseModel):
    parts: List[Dict[str, Any]]  # [{"PartNumber": 1, "ETag": "..."}]

class UploadConfirmRequest(BaseModel):
    session_id: str
    checksum: Optional[str] = None  # SHA-256 from client
    file_size: Optional[int] = None

class FileVersionRollback(BaseModel):
    notes: str = "Rollback to previous version"

class AssetSearchQuery(BaseModel):
    project_id: Optional[str] = None
    department_id: Optional[str] = None
    file_category: Optional[str] = None
    environment: Optional[str] = None
    codebase_module: Optional[str] = None
    tags: Optional[List[str]] = None
    sender_role: Optional[str] = None

# ─── ASSET VALIDATION HELPER ──────────────────────────────────────────────────

async def validate_upload_permission(user: dict, project_id: str, department_id: str, module_name: str) -> None:
    """Enforce role hierarchy, project ownership, and module integrity."""
    role = user.get("role")
    user_dept = user.get("department_id")

    # 1. Role hierarchy
    if role == "worker":
        # Worker: only in own project + department
        project = await db.projects.find_one({"project_id": project_id})
        if not project:
            raise HTTPException(404, "Project not found")
        if project.get("department_id") != user_dept:
            raise HTTPException(403, "Workers can only upload to their own department projects")
        # Check worker is a member
        members = project.get("members", [])
        member_ids = [m.get("user_id") for m in members]
        if user["user_id"] not in member_ids and project.get("department_id") != user_dept:
            raise HTTPException(403, "Worker not a member of this project")
    elif role == "hod":
        # HOD: only within own department
        if department_id != user_dept:
            raise HTTPException(403, "HODs can only upload within their own department")
    # super_admin: no restrictions

    # 2. Module integrity check (basic codebase map)
    mapping = await db.project_codebase_mapping.find_one({"project_id": project_id, "module_name": {"$regex": module_name, "$options": "i"}})
    # If mapping exists, it's valid; otherwise allow (new module)

async def detect_duplicate(checksum: str, project_id: str) -> Optional[dict]:
    """Return existing file record if checksum matches."""
    return await db.project_files.find_one({"checksum": checksum, "project_id": project_id}, {"_id": 0})

async def write_asset_audit_log(file_id: str, action: str, user: dict, metadata: dict = None):
    """Immutable audit trail for every asset action."""
    await db.file_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "file_id": file_id,
        "action": action,
        "user_id": user["user_id"],
        "user_name": user.get("name", user.get("full_name", "Unknown")),
        "user_role": user.get("role"),
        "department_id": user.get("department_id"),
        "metadata": metadata or {},
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

async def broadcast_asset_event(event_type: str, file_record: dict, department_id: str):
    """Broadcast asset event to dept users + all superadmins."""
    target_users = await db.users.find(
        {"$or": [{"department_id": department_id}, {"role": "super_admin"}]},
        {"user_id": 1}
    ).to_list(1000)
    payload = {"type": event_type, "asset": {k: v for k, v in file_record.items() if k != "_id"}}
    await manager.broadcast([u["user_id"] for u in target_users], payload)

# ─── ASSET UPLOAD SESSION ─────────────────────────────────────────────────────

@api_router.post("/assets/upload-session")
async def create_upload_session(data: UploadSessionCreate, current_user: dict = Depends(auth_required)):
    """
    STEP 1: Validate → create upload session → return presigned S3 PUT URL.
    Frontend uploads directly to S3, then calls /assets/confirm.
    """
    await validate_upload_permission(current_user, data.project_id, data.department_id, data.module_name)

    # Fetch enrichment data
    project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0})
    dept = await db.departments.find_one({"department_id": data.department_id}, {"_id": 0})
    if not project:
        raise HTTPException(404, "Project not found")

    dept_name = dept["name"] if dept else data.department_id
    project_name = project.get("name", data.project_id)

    # Build version: check existing versions
    existing_count = await db.project_files.count_documents({
        "project_id": data.project_id,
        "original_file_name": data.file_name,
    })
    auto_version = max(data.version, existing_count + 1)

    # Generate S3 key
    s3_key = s3_manager.build_s3_key(dept_name, data.project_id, data.module_name,
                                       current_user["role"], auto_version, data.file_name)

    # Generate presigned PUT URL
    url_info = s3_manager.generate_presigned_put_url(s3_key, data.mime_type)

    # Store upload session in MongoDB (acts as Redis-like session store, TTL 2h)
    session_id = f"sess_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    session_doc = {
        "session_id": session_id,
        "s3_key": s3_key,
        "mode": url_info["mode"],
        "project_id": data.project_id,
        "project_name": project_name,
        "department_id": data.department_id,
        "department_name": dept_name,
        "sender_id": current_user["user_id"],
        "sender_name": current_user.get("name", current_user.get("full_name", "Unknown")),
        "sender_role": current_user["role"],
        "original_file_name": data.file_name,
        "file_name": data.file_name,
        "mime_type": data.mime_type,
        "file_size": data.file_size,
        "version": auto_version,
        "codebase_module": data.module_name,
        "repository_branch": data.repository_branch,
        "environment": data.environment,
        "upload_source_screen": data.upload_source_screen,
        "worker_task_id": data.worker_task_id,
        "receiver_department_id": data.receiver_department_id,
        "linked_chat_thread": data.linked_chat_thread,
        "linked_roadmap_step": data.linked_roadmap_step,
        "linked_architecture_block": data.linked_architecture_block,
        "linked_deployment_stage": data.linked_deployment_stage,
        "file_category": data.file_category,
        "attachment_notes": data.attachment_notes,
        "tags": data.tags,
        "comments": data.comments,
        "project_intent": data.project_intent,
        "architecture_type": data.architecture_type,
        "status": "pending",
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=2)).isoformat(),
    }
    await db.upload_sessions.insert_one({**session_doc})

    return {
        **session_doc,
        "_id": None,
        "presigned_url": url_info.get("presigned_url"),
        "upload_mode": url_info["mode"],
        "storage_active": s3_manager.enabled,
    }

# ─── PROXY UPLOAD (S3 Express CORS workaround) ────────────────────────────────
@api_router.post("/assets/upload-proxy")
async def proxy_upload_to_s3(
    request: Request,
    file: UploadFile = FastAPIFile(...),
    session_id: str = Query(...),
    current_user: dict = Depends(auth_required)
):
    """
    Backend-proxied S3 upload for S3 Express directory buckets.
    Called by the frontend instead of a direct XHR PUT when upload_mode='proxy'.
    The browser POSTs multipart/form-data here; the server streams to S3 via IAM.
    """
    session = await db.upload_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Upload session not found or expired")
    if session.get("sender_id") != current_user["user_id"]:
        raise HTTPException(403, "Unauthorized upload session")
    if session.get("status") == "completed":
        raise HTTPException(409, "Session already completed")

    content = await file.read()
    content_type = file.content_type or session.get("mime_type", "application/octet-stream")
    client_ip = request.client.host if request.client else "unknown"

    # ── Inline security validation ──────────────────────────────────────────
    validation = await validate_upload(
        file_bytes=content,
        filename=file.filename or session.get("original_file_name", "unknown"),
        content_type=content_type,
        user_id=current_user["user_id"],
        client_ip=client_ip,
    )

    if not validation.passed:
        # Mark session as failed due to security
        await db.upload_sessions.update_one(
            {"session_id": session_id},
            {"$set": {"status": "rejected_security", "validationFlags": validation.to_mongo_flags()}}
        )
        raise HTTPException(status_code=422, detail={"error": "File rejected by security validation", "reason": validation.reason})

    # Validation passed — proceed with S3 upload
    try:
        s3_manager.upload_bytes_to_s3(session["s3_key"], content, content_type)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Proxy upload failed for session {session_id}: {e}")
        raise HTTPException(500, f"Proxy upload failed: {e}")

    await db.upload_sessions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": "uploaded_proxy",
            "validationFlags": validation.to_mongo_flags()
        }}
    )
    logger.info(f"✅ Proxy upload complete — session {session_id} → {session['s3_key']}")
    return {"status": "uploaded", "session_id": session_id, "s3_key": session["s3_key"], "validationFlags": validation.to_mongo_flags()}



@api_router.post("/assets/upload-session/multipart")
async def initiate_multipart_upload(data: MultipartInitRequest, current_user: dict = Depends(auth_required)):
    """Initiate S3 multipart upload for files >100MB. Returns upload_id + session_id."""
    await validate_upload_permission(current_user, data.project_id, data.department_id, data.module_name)

    dept = await db.departments.find_one({"department_id": data.department_id}, {"_id": 0})
    dept_name = dept["name"] if dept else data.department_id

    s3_key = s3_manager.build_s3_key(dept_name, data.project_id, data.module_name,
                                       current_user["role"], data.version, data.file_name)
    upload_id = s3_manager.initiate_multipart_upload(s3_key, data.mime_type)

    session_id = f"mp_sess_{uuid.uuid4().hex[:14]}"
    now = datetime.now(timezone.utc)
    session_doc = {
        "session_id": session_id,
        "upload_id": upload_id,
        "s3_key": s3_key,
        "total_parts": data.total_parts,
        "completed_parts": [],
        "project_id": data.project_id,
        "department_id": data.department_id,
        "department_name": dept_name,
        "sender_id": current_user["user_id"],
        "sender_name": current_user.get("name", "Unknown"),
        "sender_role": current_user["role"],
        "original_file_name": data.file_name,
        "file_name": data.file_name,
        "mime_type": data.mime_type,
        "file_size": data.file_size,
        "version": data.version,
        "codebase_module": data.module_name,
        "repository_branch": data.repository_branch,
        "environment": data.environment,
        "file_category": data.file_category,
        "linked_chat_thread": data.linked_chat_thread,
        "linked_roadmap_step": data.linked_roadmap_step,
        "linked_deployment_stage": data.linked_deployment_stage,
        "tags": data.tags,
        "type": "multipart",
        "status": "in_progress",
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),
    }
    await db.upload_sessions.insert_one({**session_doc})

    return {**session_doc, "_id": None}

@api_router.post("/assets/upload-session/multipart/{session_id}/part")
async def get_part_presigned_url(session_id: str, data: MultipartPartRequest, current_user: dict = Depends(auth_required)):
    """Return a presigned URL for uploading a single multipart chunk."""
    session = await db.upload_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session or session.get("sender_id") != current_user["user_id"]:
        raise HTTPException(403, "Session not found or unauthorized")
    url = s3_manager.generate_presigned_part_url(session["s3_key"], session["upload_id"], data.part_number)
    return {"part_number": data.part_number, "presigned_url": url}

@api_router.post("/assets/upload-session/multipart/{session_id}/complete")
async def complete_multipart(session_id: str, data: MultipartCompleteRequest, current_user: dict = Depends(auth_required)):
    """Complete a multipart upload and finalize the asset record in MongoDB."""
    session = await db.upload_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session or session.get("sender_id") != current_user["user_id"]:
        raise HTTPException(403, "Session not found or unauthorized")

    s3_manager.complete_multipart_upload(session["s3_key"], session["upload_id"], data.parts)

    # ── Inline security validation for completed multipart ──
    try:
        content, _ = s3_manager.get_object(session["s3_key"])
        validation = await validate_upload(
            file_bytes=content,
            filename=session.get("original_file_name", "unknown"),
            content_type=session.get("mime_type"),
            user_id=current_user["user_id"]
        )
        flags = validation.to_mongo_flags()
        if not validation.passed:
            s3_manager.delete_object(session["s3_key"])
            await db.upload_sessions.update_one({"session_id": session_id}, {"$set": {"status": "rejected_security"}})
            raise HTTPException(422, f"File rejected by security validation: {validation.reason}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to validate multipart file from S3: {e}")
        raise HTTPException(500, "Failed to validate uploaded file")

    # Mark session done and create file record
    await db.upload_sessions.update_one({"session_id": session_id}, {"$set": {"status": "completed", "validationFlags": flags}})

    file_id = f"asset_{uuid.uuid4().hex[:14]}"
    now = datetime.now(timezone.utc).isoformat()
    signed_download_url = s3_manager.generate_presigned_get_url(session["s3_key"])

    file_record = {
        "file_id": file_id,
        "project_id": session["project_id"],
        "project_name": session.get("project_name", session["project_id"]),
        "department_id": session["department_id"],
        "department_name": session.get("department_name", session["department_id"]),
        "sender_id": session["sender_id"],
        "sender_name": session["sender_name"],
        "sender_role": session["sender_role"],
        "original_file_name": session["original_file_name"],
        "file_name": session["file_name"],
        "mime_type": session["mime_type"],
        "file_size": session["file_size"],
        "s3_key": session["s3_key"],
        "signed_download_url": signed_download_url,
        "checksum": None,
        "version": session["version"],
        "previous_version_id": None,
        "upload_timestamp": now,
        "created_at": now,
        "linked_chat_thread": session.get("linked_chat_thread"),
        "linked_roadmap_step": session.get("linked_roadmap_step"),
        "linked_architecture_block": None,
        "linked_deployment_stage": session.get("linked_deployment_stage"),
        "codebase_module": session.get("codebase_module"),
        "repository_branch": session.get("repository_branch", "main"),
        "environment": session.get("environment", "development"),
        "upload_source_screen": "multipart_upload",
        "worker_task_id": None,
        "approval_status": "approved",
        "reviewed_by": None,
        "ai_analysis_status": "pending",
        "validationFlags": flags,
        "retention_policy": "standard",
        "tags": session.get("tags", []),
        "comments": "",
        "file_category": session.get("file_category", "Other"),
        "is_multipart": True,
        "upload_type": "multipart",
        # AI-ready
        "semantic_tags": [],
        "project_intent": None,
        "architecture_type": None,
        "roadmap_relevance": None,
        "risk_score": 0,
        "unresolved_dependency": False,
        "is_latest_version": True,
    }

    original_name = session.get("original_file_name") or session.get("file_name", "")
    await db.project_files.update_many(
        {"project_id": session["project_id"], "$or": [
            {"original_file_name": original_name},
            {"file_name": original_name},
        ]},
        {"$set": {"is_latest_version": False}}
    )

    file_record["status"] = "approved"
    await db.project_files.insert_one({**file_record})
    await write_asset_audit_log(file_id, "uploaded_multipart", current_user, {"session_id": session_id})
    await broadcast_asset_event("asset_uploaded", file_record, session["department_id"])
    await log_file_activity(file_id, "uploaded", session["sender_id"], session["sender_name"], session["department_id"], {"filename": session["file_name"]})

    return {**file_record, "_id": None}

@api_router.delete("/assets/upload-session/{session_id}")
async def abort_upload_session(session_id: str, current_user: dict = Depends(auth_required)):
    """Cancel / abort an upload session (also aborts S3 multipart if applicable)."""
    session = await db.upload_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Session not found")
    if session.get("sender_id") != current_user["user_id"] and current_user["role"] != "super_admin":
        raise HTTPException(403, "Unauthorized")

    if session.get("upload_id"):  # multipart
        s3_manager.abort_multipart_upload(session["s3_key"], session["upload_id"])

    await db.upload_sessions.update_one({"session_id": session_id}, {"$set": {"status": "aborted"}})
    return {"status": "aborted", "session_id": session_id}

# ─── UPLOAD CONFIRM (for presigned URL flow) ──────────────────────────────────

@api_router.post("/assets/confirm")
async def confirm_asset_upload(data: UploadConfirmRequest, current_user: dict = Depends(auth_required)):
    """
    STEP 3: Frontend calls this after directly uploading to S3.
    Validates session, checks checksum, creates full MongoDB intelligence record.
    """
    session = await db.upload_sessions.find_one({"session_id": data.session_id}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Upload session not found or expired")
    if session.get("sender_id") != current_user["user_id"]:
        raise HTTPException(403, "Unauthorized session")
    if session.get("status") == "completed":
        raise HTTPException(409, "Session already confirmed")

    # Duplicate detection
    if data.checksum:
        duplicate = await detect_duplicate(data.checksum, session["project_id"])
        if duplicate:
            await db.upload_sessions.update_one({"session_id": data.session_id}, {"$set": {"status": "duplicate_rejected"}})
            return {
                "status": "duplicate_detected",
                "existing_file_id": duplicate["file_id"],
                "existing_s3_key": duplicate["s3_key"],
                "message": "File already exists in this project (checksum match). Use versioning if this is an update."
            }

    # ── Inline security validation for S3 direct uploads ──
    flags = session.get("validationFlags")
    if not flags:
        try:
            content, _ = s3_manager.get_object(session["s3_key"])
            validation = await validate_upload(
                file_bytes=content,
                filename=session.get("original_file_name", "unknown"),
                content_type=session.get("mime_type"),
                user_id=current_user["user_id"]
            )
            flags = validation.to_mongo_flags()
            if not validation.passed:
                s3_manager.delete_object(session["s3_key"])
                await db.upload_sessions.update_one({"session_id": data.session_id}, {"$set": {"status": "rejected_security"}})
                raise HTTPException(422, f"File rejected by security validation: {validation.reason}")
        except Exception as e:
            logger.error(f"Failed to validate file from S3: {e}")
            raise HTTPException(500, "Failed to validate uploaded file")

    # Find previous version for lineage
    # Fallback: older sessions stored 'file_name', newer store 'original_file_name'
    original_name = session.get("original_file_name") or session.get("file_name", "")
    previous = await db.project_files.find_one(
        {"project_id": session["project_id"], "$or": [
            {"original_file_name": original_name},
            {"file_name": original_name},
        ]},
        {"_id": 0},
        sort=[("version", -1)]
    )
    previous_version_id = previous["file_id"] if previous else None

    file_id = f"asset_{uuid.uuid4().hex[:14]}"
    now = datetime.now(timezone.utc).isoformat()

    # Generate signed download URL
    signed_download_url = s3_manager.generate_presigned_get_url(session["s3_key"])

    file_record = {
        # ── Core Identity ──────────────────────────────────────────────────────
        "file_id": file_id,
        "project_id": session["project_id"],
        "project_name": session.get("project_name", session["project_id"]),
        "department_id": session["department_id"],
        "department_name": session.get("department_name", session["department_id"]),
        # ── Sender/Receiver ────────────────────────────────────────────────────
        "sender_id": session["sender_id"],
        "sender_name": session["sender_name"],
        "sender_role": session["sender_role"],
        "receiver_id": None,
        "receiver_role": None,
        "receiver_department_id": session.get("receiver_department_id"),
        # ── File Info ──────────────────────────────────────────────────────────
        "file_name": session.get("file_name", ""),
        "original_file_name": session.get("original_file_name") or session.get("file_name", ""),
        "mime_type": session.get("mime_type", "application/octet-stream"),
        "file_size": data.file_size or session.get("file_size", 0),
        # ── S3 Storage ─────────────────────────────────────────────────────────
        "s3_key": session.get("s3_key"),
        "signed_download_url": signed_download_url,
        # upload_mode may be stored as 'mode' (older) or 'upload_mode' (newer)
        "upload_mode": session.get("upload_mode") or session.get("mode", "local"),
        # ── Integrity ──────────────────────────────────────────────────────────
        "checksum": data.checksum,
        "approval_status": "approved",
        "reviewed_by": None,
        "ai_analysis_status": "pending",
        "validationFlags": flags,
        # ── Versioning & Lineage ───────────────────────────────────────────────
        "version": session["version"],
        "previous_version_id": previous_version_id,
        # ── Timestamps ────────────────────────────────────────────────────────
        "upload_timestamp": now,
        "created_at": now,
        # ── Traceability Links ─────────────────────────────────────────────────
        "linked_chat_thread": session.get("linked_chat_thread"),
        "linked_roadmap_step": session.get("linked_roadmap_step"),
        "linked_architecture_block": session.get("linked_architecture_block"),
        "linked_deployment_stage": session.get("linked_deployment_stage"),
        # ── Codebase Intelligence ──────────────────────────────────────────────
        "codebase_module": session.get("codebase_module"),
        "repository_branch": session.get("repository_branch", "main"),
        "environment": session.get("environment", "development"),
        "upload_source_screen": session.get("upload_source_screen", "project_dashboard"),
        "worker_task_id": session.get("worker_task_id"),
        # ── Classification ─────────────────────────────────────────────────────
        "file_category": session.get("file_category", "Other"),
        "tags": session.get("tags", []),
        "comments": session.get("comments", ""),
        "attachment_notes": session.get("attachment_notes", ""),
        "retention_policy": "standard",
        # ── AI-Ready Metadata ──────────────────────────────────────────────────
        "semantic_tags": [],
        "project_intent": session.get("project_intent"),
        "architecture_type": session.get("architecture_type"),
        "roadmap_relevance": None,
        "worker_ownership": session["sender_id"] if session["sender_role"] == "worker" else None,
        "deployment_stage": session.get("linked_deployment_stage"),
        "risk_score": 0,
        "unresolved_dependency": False,
        "is_latest_version": True,
    }

    await db.project_files.update_many(
        {"project_id": session["project_id"], "$or": [
            {"original_file_name": original_name},
            {"file_name": original_name},
        ]},
        {"$set": {"is_latest_version": False}}
    )

    file_record["status"] = "approved"
    await db.project_files.insert_one({**file_record})

    # Version lineage record
    if previous_version_id:
        await db.file_versions.insert_one({
            "version_id": f"ver_{uuid.uuid4().hex[:12]}",
            "file_id": file_id,
            "previous_file_id": previous_version_id,
            "version": session["version"],
            "project_id": session["project_id"],
            "s3_key": session["s3_key"],
            "uploaded_by": session["sender_id"],
            "uploaded_at": now,
        })

    # Mark session completed
    await db.upload_sessions.update_one({"session_id": data.session_id}, {"$set": {"status": "completed", "file_id": file_id}})

    # Auto-link to chat if specified
    if session.get("linked_chat_thread"):
        await db.chat_attachments.insert_one({
            "attachment_id": f"att_{uuid.uuid4().hex[:12]}",
            "file_id": file_id,
            "chat_id": session["linked_chat_thread"],
            "sender_id": session["sender_id"],
            "sender_name": session["sender_name"],
            "sender_role": session["sender_role"],
            "s3_key": session["s3_key"],
            "file_name": session["file_name"],
            "mime_type": session["mime_type"],
            "file_size": file_record["file_size"],
            "signed_download_url": signed_download_url,
            "project_id": session["project_id"],
            "department_id": session["department_id"],
            "created_at": now,
        })

    # Audit log + notifications
    await write_asset_audit_log(file_id, "uploaded", current_user, {"session_id": data.session_id, "s3_key": session["s3_key"]})
    await log_file_activity(file_id, "uploaded", session["sender_id"], session["sender_name"], session["department_id"], {"filename": session["file_name"], "project_id": session["project_id"]})
    user_name = current_user.get("name", current_user.get("full_name", "Unknown"))
    await create_system_notification(session["department_id"], "Asset Uploaded",
        f"{user_name} uploaded {session['file_name']} to {session.get('project_name', session['project_id'])}",
        "asset_upload", current_user)

    # WebSocket broadcast: asset_uploaded
    await broadcast_asset_event("asset_uploaded", file_record, session["department_id"])

    # Security validation already passed inline — file is safe and stored
    await broadcast_asset_event("asset_approved", {"file_id": file_id, "s3_key": session["s3_key"]}, session["department_id"])

    return {**file_record, "_id": None, "status": "confirmed"}

# ─── SERVER-SIDE UPLOAD (fallback when S3 presigned not available) ─────────────

@api_router.post("/assets/upload-direct")
async def upload_asset_direct(
    request: Request,
    project_id: str = Query(...),
    department_id: str = Query(...),
    module_name: str = Query("General"),
    version: int = Query(1),
    file_category: str = Query("Other"),
    repository_branch: str = Query("main"),
    environment: str = Query("development"),
    linked_chat_thread: Optional[str] = Query(None),
    linked_roadmap_step: Optional[str] = Query(None),
    linked_deployment_stage: Optional[str] = Query(None),
    tags: str = Query(""),
    attachment_notes: str = Query(""),
    file: UploadFile = FastAPIFile(...),
    current_user: dict = Depends(auth_required),
):
    """Fallback direct server-side upload (local mode or small files)."""
    await validate_upload_permission(current_user, project_id, department_id, module_name)

    content = await file.read()
    checksum = compute_checksum(content)

    # Duplicate check
    duplicate = await db.project_files.find_one({"checksum": checksum, "project_id": project_id}, {"_id": 0})
    if duplicate:
        return {"status": "duplicate_detected", "existing_file_id": duplicate["file_id"], "message": "Duplicate file detected"}

    dept = await db.departments.find_one({"department_id": department_id}, {"_id": 0})
    dept_name = dept["name"] if dept else department_id
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    project_name = project["name"] if project else project_id

    # Version auto-detect
    existing_count = await db.project_files.count_documents({"project_id": project_id, "original_file_name": file.filename})
    auto_version = max(version, existing_count + 1)

    # ── Inline security validation ──────────────────────────────────────────
    client_ip = request.client.host if request.client else "unknown"
    validation = await validate_upload(
        file_bytes=content,
        filename=file.filename or "unknown",
        content_type=file.content_type,
        user_id=current_user["user_id"],
        client_ip=client_ip,
    )

    if not validation.passed:
        # File rejected by security — do not upload to S3
        raise HTTPException(status_code=422, detail={"error": "File rejected by security validation", "reason": validation.reason})

    s3_key = s3_manager.build_s3_key(dept_name, project_id, module_name, current_user["role"], auto_version, validation.safe_filename)
    s3_manager.put_object_direct(s3_key, content, file.content_type or "application/octet-stream")
    signed_download_url = s3_manager.generate_presigned_get_url(s3_key)

    previous = await db.project_files.find_one({"project_id": project_id, "original_file_name": file.filename}, {"_id": 0}, sort=[("version", -1)])
    previous_version_id = previous["file_id"] if previous else None

    file_id = f"asset_{uuid.uuid4().hex[:14]}"
    now = datetime.now(timezone.utc).isoformat()

    file_record = {
        "file_id": file_id,
        "project_id": project_id,
        "project_name": project_name,
        "department_id": department_id,
        "department_name": dept_name,
        "sender_id": current_user["user_id"],
        "sender_name": current_user.get("name", "Unknown"),
        "sender_role": current_user["role"],
        "receiver_id": None,
        "receiver_role": None,
        "receiver_department_id": None,
        "file_name": file.filename,
        "original_file_name": file.filename,
        "mime_type": file.content_type or "application/octet-stream",
        "file_size": len(content),
        "s3_key": s3_key,
        "signed_download_url": signed_download_url,
        "upload_mode": "s3" if s3_manager.enabled else "local",
        "checksum": checksum,
        "approval_status": "approved",
        "reviewed_by": None,
        "ai_analysis_status": "pending",
        "status": "approved",
        "validationFlags": validation.to_mongo_flags(),
        "version": auto_version,
        "previous_version_id": previous_version_id,
        "upload_timestamp": now,
        "created_at": now,
        "linked_chat_thread": linked_chat_thread,
        "linked_roadmap_step": linked_roadmap_step,
        "linked_architecture_block": None,
        "linked_deployment_stage": linked_deployment_stage,
        "codebase_module": module_name,
        "repository_branch": repository_branch,
        "environment": environment,
        "upload_source_screen": "direct_upload",
        "worker_task_id": None,
        "file_category": file_category,
        "tags": [t.strip() for t in tags.split(",") if t.strip()],
        "comments": "",
        "attachment_notes": attachment_notes,
        "retention_policy": "standard",
        "semantic_tags": [],
        "project_intent": None,
        "architecture_type": None,
        "roadmap_relevance": None,
        "risk_score": 0,
        "unresolved_dependency": False,
        "is_latest_version": True,
    }

    await db.project_files.update_many(
        {"project_id": project_id, "$or": [
            {"original_file_name": file.filename},
            {"file_name": file.filename},
        ]},
        {"$set": {"is_latest_version": False}}
    )
    await db.project_files.insert_one({**file_record})

    if previous_version_id:
        await db.file_versions.insert_one({
            "version_id": f"ver_{uuid.uuid4().hex[:12]}",
            "file_id": file_id,
            "previous_file_id": previous_version_id,
            "version": auto_version,
            "project_id": project_id,
            "s3_key": s3_key,
            "uploaded_by": current_user["user_id"],
            "uploaded_at": now,
        })

    if linked_chat_thread:
        await db.chat_attachments.insert_one({
            "attachment_id": f"att_{uuid.uuid4().hex[:12]}",
            "file_id": file_id,
            "chat_id": linked_chat_thread,
            "sender_id": current_user["user_id"],
            "sender_name": current_user.get("name", "Unknown"),
            "sender_role": current_user["role"],
            "s3_key": s3_key,
            "file_name": file.filename,
            "mime_type": file.content_type or "application/octet-stream",
            "file_size": len(content),
            "signed_download_url": signed_download_url,
            "project_id": project_id,
            "department_id": department_id,
            "created_at": now,
        })

    await write_asset_audit_log(file_id, "uploaded_direct", current_user, {"s3_key": s3_key})
    await log_file_activity(file_id, "uploaded", current_user["user_id"], current_user.get("name", "Unknown"), department_id, {"filename": file.filename, "project_id": project_id})
    user_name = current_user.get("name", "Unknown")
    await create_system_notification(department_id, "Asset Uploaded", f"{user_name} uploaded {file.filename}", "asset_upload", current_user)
    await broadcast_asset_event("asset_uploaded", file_record, department_id)

    return {**file_record, "_id": None}

# ─── ASSET RETRIEVAL ──────────────────────────────────────────────────────────

@api_router.get("/assets/project/{project_id}")
async def get_project_assets(
    project_id: str,
    file_category: Optional[str] = None,
    environment: Optional[str] = None,
    codebase_module: Optional[str] = None,
    sender_role: Optional[str] = None,
    current_user: dict = Depends(auth_required)
):
    """Get all assets for a project, optionally filtered."""
    query = {"project_id": project_id}
    if file_category:
        query["file_category"] = file_category
    if environment:
        query["environment"] = environment
    if codebase_module:
        query["codebase_module"] = {"$regex": codebase_module, "$options": "i"}
    if sender_role:
        query["sender_role"] = sender_role

    # Role restrictions
    if current_user["role"] == "worker":
        project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        if project and project.get("department_id") != current_user.get("department_id"):
            raise HTTPException(403, "Access denied to this project's assets")
    elif current_user["role"] == "hod":
        project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        if project and project.get("department_id") != current_user.get("department_id"):
            raise HTTPException(403, "HODs can only view their department's project assets")

    files = await db.project_files.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Refresh signed URLs on fetch
    for f in files:
        if f.get("s3_key") and s3_manager.enabled:
            f["signed_download_url"] = s3_manager.generate_presigned_get_url(f["s3_key"])

    # Categorize
    categories = {}
    for f in files:
        cat = f.get("file_category", "Other")
        categories.setdefault(cat, []).append(f)

    return {
        "files": files,
        "total": len(files),
        "by_category": categories,
        "storage_mode": "s3" if s3_manager.enabled else "local"
    }

@api_router.get("/assets/{file_id}")
async def get_asset_detail(file_id: str, current_user: dict = Depends(auth_required)):
    """Get a single asset with full intelligence model + version lineage."""
    asset = await db.project_files.find_one({"file_id": file_id}, {"_id": 0})
    if not asset:
        # fallback: check old project_files collection style
        asset = await db.project_files.find_one({"file_id": file_id}, {"_id": 0})
    if not asset:
        raise HTTPException(404, "Asset not found")

    # Refresh signed URL
    if asset.get("s3_key") and s3_manager.enabled:
        asset["signed_download_url"] = s3_manager.generate_presigned_get_url(asset["s3_key"])

    # Fetch version chain
    versions = await db.project_files.find(
        {"project_id": asset["project_id"], "original_file_name": asset.get("original_file_name", asset["file_name"])},
        {"_id": 0}
    ).sort("version", 1).to_list(50)

    # Fetch dependency links
    deps = await db.asset_dependency_links.find({"file_id": file_id}, {"_id": 0}).to_list(20)

    return {**asset, "version_chain": versions, "dependency_links": deps}

@api_router.get("/assets/{file_id}/download-url")
async def get_asset_download_url(file_id: str, current_user: dict = Depends(auth_required)):
    """Return a URL the browser can use to download the asset.
    
    For S3 Express directory buckets (suffix --x-s3): presigned GET URLs cannot
    be fetched by the browser due to CORS, so we route through the /stream
    endpoint which serves the file via the backend using IAM credentials.
    For standard S3 buckets: return the presigned GET URL directly.
    """
    asset = await db.project_files.find_one({"file_id": file_id}, {"_id": 0})
    if not asset:
        raise HTTPException(404, "Asset not found")

    if s3_manager.enabled and asset.get("s3_key"):
        is_express = AWS_S3_BUCKET_NAME.endswith("--x-s3")
        if is_express:
            # S3 Express: browser cannot GET directly — route through our stream proxy
            await write_asset_audit_log(file_id, "download_url_generated", current_user, {})
            return {"download_url": f"/api/assets/{file_id}/stream", "mode": "proxy"}
        else:
            signed_url = s3_manager.generate_presigned_get_url(asset["s3_key"])
            await write_asset_audit_log(file_id, "download_url_generated", current_user, {})
            return {"download_url": signed_url, "expires_in": S3_PRESIGNED_URL_EXPIRY, "mode": "s3"}

    # Local mode: stream download
    return {"download_url": f"/api/assets/{file_id}/stream", "mode": "local"}

@api_router.get("/assets/{file_id}/stream")
async def stream_asset(file_id: str, current_user: dict = Depends(auth_required)):
    """Stream asset content (local storage mode)."""
    asset = await db.project_files.find_one({"file_id": file_id}, {"_id": 0})
    if not asset:
        raise HTTPException(404, "Asset not found")
    s3_key = asset.get("s3_key") or asset.get("file_url", "")
    content, content_type = s3_manager.get_object(s3_key)
    await write_asset_audit_log(file_id, "downloaded", current_user, {})
    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename=\"{asset['file_name']}\""}
    )

# ─── VERSION HISTORY & ROLLBACK ───────────────────────────────────────────────

@api_router.get("/assets/{file_id}/versions")
async def get_asset_versions(file_id: str, current_user: dict = Depends(auth_required)):
    """Return full version history for an asset by original_file_name + project."""
    asset = await db.project_files.find_one({"file_id": file_id}, {"_id": 0})
    if not asset:
        raise HTTPException(404, "Asset not found")
    versions = await db.project_files.find(
        {"project_id": asset["project_id"], "original_file_name": asset.get("original_file_name", asset["file_name"])},
        {"_id": 0}
    ).sort("version", 1).to_list(100)

    for v in versions:
        if v.get("s3_key") and s3_manager.enabled:
            v["signed_download_url"] = s3_manager.generate_presigned_get_url(v["s3_key"])
    return {"versions": versions, "total": len(versions)}

@api_router.post("/assets/{file_id}/rollback/{target_version_id}")
async def rollback_asset(file_id: str, target_version_id: str, data: FileVersionRollback, current_user: dict = Depends(auth_required)):
    """Restore an asset to a previous version by creating a new version record pointing back."""
    if current_user["role"] == "worker":
        raise HTTPException(403, "Workers cannot perform rollbacks")

    source = await db.project_files.find_one({"file_id": target_version_id}, {"_id": 0})
    if not source:
        raise HTTPException(404, "Target version not found")

    now = datetime.now(timezone.utc).isoformat()
    latest = await db.project_files.find_one(
        {"project_id": source["project_id"], "original_file_name": source.get("original_file_name", source["file_name"])},
        {"_id": 0},
        sort=[("version", -1)]
    )
    new_version = (latest["version"] if latest else 0) + 1

    # New version = copy of target with incremented version
    new_file_id = f"asset_{uuid.uuid4().hex[:14]}"
    restored = {**source, "file_id": new_file_id, "version": new_version,
                "previous_version_id": file_id,
                "upload_timestamp": now, "created_at": now,
                "comments": f"Rollback to v{source['version']} — {data.notes}",
                "approval_status": "approved",
                "validationFlags": source.get("validationFlags"),
                "is_latest_version": True}
    restored.pop("_id", None)

    if s3_manager.enabled and restored.get("s3_key"):
        restored["signed_download_url"] = s3_manager.generate_presigned_get_url(restored["s3_key"])

    await db.project_files.update_many(
        {"project_id": source["project_id"], "$or": [
            {"original_file_name": source.get("original_file_name", source["file_name"])},
            {"file_name": source.get("original_file_name", source["file_name"])},
        ]},
        {"$set": {"is_latest_version": False}}
    )

    restored["status"] = "approved"
    await db.project_files.insert_one({**restored})
    await write_asset_audit_log(new_file_id, "rollback", current_user, {"from_file_id": file_id, "target_version_id": target_version_id, "notes": data.notes})
    await broadcast_asset_event("asset_rollback", restored, source["department_id"])

    return {**restored, "_id": None}

# ─── AUDIT LOG ────────────────────────────────────────────────────────────────

@api_router.get("/assets/{file_id}/audit")
async def get_asset_audit(file_id: str, current_user: dict = Depends(auth_required)):
    """Return full audit trail for an asset."""
    if current_user["role"] not in ["super_admin", "hod"]:
        raise HTTPException(403, "Audit access requires HOD or Admin role")
    logs = await db.file_audit_logs.find({"file_id": file_id}, {"_id": 0}).sort("timestamp", 1).to_list(500)
    return {"audit_log": logs, "total": len(logs)}

@api_router.get("/assets/audit/department/{department_id}")
async def get_department_asset_audit(department_id: str, current_user: dict = Depends(auth_required)):
    """All asset audit events for a department."""
    if current_user["role"] == "worker":
        raise HTTPException(403, "Forbidden")
    if current_user["role"] == "hod" and department_id != current_user.get("department_id"):
        raise HTTPException(403, "HODs can only view their own department audit")
    logs = await db.file_audit_logs.find({"department_id": department_id}, {"_id": 0}).sort("timestamp", -1).limit(200).to_list(200)
    return {"audit_log": logs, "total": len(logs)}

# ─── DUPLICATE DETECTION ──────────────────────────────────────────────────────

@api_router.get("/assets/intelligence/duplicate/{checksum}")
async def check_duplicate(checksum: str, project_id: str = Query(...), current_user: dict = Depends(auth_required)):
    """Check if a file with this SHA-256 checksum already exists in the project."""
    existing = await detect_duplicate(checksum, project_id)
    if existing:
        if existing.get("s3_key") and s3_manager.enabled:
            existing["signed_download_url"] = s3_manager.generate_presigned_get_url(existing["s3_key"])
        return {"is_duplicate": True, "existing_asset": existing}
    return {"is_duplicate": False}

@api_router.get("/assets/intelligence/search")
async def search_assets(
    project_id: Optional[str] = None,
    department_id: Optional[str] = None,
    file_category: Optional[str] = None,
    environment: Optional[str] = None,
    codebase_module: Optional[str] = None,
    tags: Optional[str] = None,
    sender_role: Optional[str] = None,
    current_user: dict = Depends(auth_required)
):
    """Search assets by metadata across the intelligence model."""
    query = {}
    if project_id:
        query["project_id"] = project_id
    if department_id:
        if current_user["role"] == "hod" and department_id != current_user.get("department_id"):
            raise HTTPException(403, "HOD dept restriction")
        query["department_id"] = department_id
    elif current_user["role"] == "hod":
        query["department_id"] = current_user.get("department_id")
    elif current_user["role"] == "worker":
        query["department_id"] = current_user.get("department_id")

    if file_category:
        query["file_category"] = file_category
    if environment:
        query["environment"] = environment
    if codebase_module:
        query["codebase_module"] = {"$regex": codebase_module, "$options": "i"}
    if sender_role:
        query["sender_role"] = sender_role
    if tags:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        query["tags"] = {"$in": tag_list}

    files = await db.project_files.find(query, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    for f in files:
        if f.get("s3_key") and s3_manager.enabled:
            f["signed_download_url"] = s3_manager.generate_presigned_get_url(f["s3_key"])
    return {"results": files, "total": len(files)}

# ─── CHAT ATTACHMENTS ─────────────────────────────────────────────────────────

@api_router.get("/assets/chat/{chat_id}/attachments")
async def get_chat_attachments(chat_id: str, current_user: dict = Depends(auth_required)):
    """All file attachments for a chat thread."""
    atts = await db.chat_attachments.find({"chat_id": chat_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for a in atts:
        if a.get("s3_key") and s3_manager.enabled:
            a["signed_download_url"] = s3_manager.generate_presigned_get_url(a["s3_key"])
    return atts

# ─── ARCHITECTURE ASSETS ──────────────────────────────────────────────────────

@api_router.get("/assets/architecture/{project_id}")
async def get_architecture_assets(project_id: str, current_user: dict = Depends(auth_required)):
    """Architecture diagrams, block images, system flow, infra reports for a project."""
    arch_cats = ["Block Architecture", "System Flow", "Deployment Flow", "Sequence Logic", "Notebook LLM Diagram", "Flowchart"]
    files = await db.project_files.find(
        {"project_id": project_id, "file_category": {"$in": arch_cats}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    for f in files:
        if f.get("s3_key") and s3_manager.enabled:
            f["signed_download_url"] = s3_manager.generate_presigned_get_url(f["s3_key"])
    return {"architecture_assets": files, "total": len(files)}

# ─── ROADMAP ASSETS ───────────────────────────────────────────────────────────

@api_router.get("/assets/roadmap/{project_id}")
async def get_roadmap_assets(project_id: str, roadmap_step: Optional[str] = None, current_user: dict = Depends(auth_required)):
    """Files linked to roadmap steps for a project."""
    query = {"project_id": project_id, "file_category": {"$in": ["Roadmap Visual", "PDF Report", "Other"]}}
    if roadmap_step:
        query["linked_roadmap_step"] = roadmap_step
    files = await db.project_files.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    for f in files:
        if f.get("s3_key") and s3_manager.enabled:
            f["signed_download_url"] = s3_manager.generate_presigned_get_url(f["s3_key"])
    return {"roadmap_assets": files, "total": len(files)}

# ─── DEPLOYMENT ASSETS ────────────────────────────────────────────────────────

@api_router.get("/assets/deployment/{project_id}")
async def get_deployment_assets(project_id: str, current_user: dict = Depends(auth_required)):
    """Deployment configs, bundles, ZIPs for a project."""
    files = await db.project_files.find(
        {"project_id": project_id, "file_category": {"$in": ["Deployment Flow", "Code Payload"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    for f in files:
        if f.get("s3_key") and s3_manager.enabled:
            f["signed_download_url"] = s3_manager.generate_presigned_get_url(f["s3_key"])
    return {"deployment_assets": files, "total": len(files)}

# ─── WORKER SUBMISSION ASSETS ─────────────────────────────────────────────────

@api_router.get("/assets/worker/{worker_id}")
async def get_worker_submission_assets(worker_id: str, current_user: dict = Depends(auth_required)):
    """All assets submitted by a worker."""
    if current_user["role"] == "worker" and current_user["user_id"] != worker_id:
        raise HTTPException(403, "Workers can only view their own submissions")
    files = await db.project_files.find({"sender_id": worker_id, "sender_role": "worker"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for f in files:
        if f.get("s3_key") and s3_manager.enabled:
            f["signed_download_url"] = s3_manager.generate_presigned_get_url(f["s3_key"])
    return {"worker_assets": files, "total": len(files), "worker_id": worker_id}

# ─── AI METADATA UPDATE ───────────────────────────────────────────────────────

@api_router.put("/assets/{file_id}/ai-metadata")
async def update_ai_metadata(file_id: str, metadata: Dict[str, Any], current_user: dict = Depends(auth_required)):
    """Update AI-ready metadata fields (semantic tags, risk score, etc.)."""
    if current_user["role"] not in ["super_admin", "hod"]:
        raise HTTPException(403, "Admin or HOD only")
    allowed = ["semantic_tags", "project_intent", "architecture_type", "roadmap_relevance",
               "risk_score", "unresolved_dependency", "ai_analysis_status"]
    update = {k: v for k, v in metadata.items() if k in allowed}
    if update:
        await db.project_files.update_one({"file_id": file_id}, {"$set": update})
    return {"updated": True, "fields": list(update.keys())}

@api_router.put("/assets/{file_id}/approve")
async def approve_asset(file_id: str, current_user: dict = Depends(auth_required)):
    """HOD/Admin approves an asset."""
    if current_user["role"] not in ["super_admin", "hod"]:
        raise HTTPException(403, "HOD or Admin only")
    await db.project_files.update_one({"file_id": file_id}, {"$set": {
        "approval_status": "approved",
        "reviewed_by": current_user["user_id"],
    }})
    await write_asset_audit_log(file_id, "approved", current_user, {})
    return {"approval_status": "approved", "reviewed_by": current_user["user_id"]}

# ─── STORAGE STATUS ───────────────────────────────────────────────────────────

@api_router.get("/assets/storage/status")
async def get_storage_status(current_user: dict = Depends(auth_required)):
    """Return S3 / local storage status for the frontend to display."""
    return {
        "s3_enabled": s3_manager.enabled,
        "storage_mode": "s3" if s3_manager.enabled else "local",
        "bucket": AWS_S3_BUCKET_NAME if s3_manager.enabled else None,
        "region": AWS_REGION if s3_manager.enabled else None,
        "presigned_url_expiry": S3_PRESIGNED_URL_EXPIRY,
        "multipart_supported": s3_manager.enabled,
    }

app.include_router(api_router)


# ─── WEBSOCKET ────────────────────────────────────────────────────────────────
@app.websocket("/api/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            # 1. Heartbeat
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            
            # 2. Real-time Messaging (with RBAC)
            if data.get("type") == "message":
                receiver_id = data.get("receiver_id")
                content = data.get("content", "")
                msg_type = data.get("msg_type", "text")
                file_meta = data.get("file_metadata")
                reply_to = data.get("reply_to")  # message_id being replied to
                
                if not receiver_id or (not content and not file_meta):
                    continue
                
                # === RBAC GATE: Validate sender → receiver is allowed ===
                sender_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
                receiver_doc = await db.users.find_one({"user_id": receiver_id}, {"_id": 0, "password_hash": 0})
                
                if not sender_doc or not receiver_doc:
                    await websocket.send_json({"type": "chat_error", "error": "User not found"})
                    continue
                
                if not is_chat_allowed(sender_doc, receiver_doc):
                    await websocket.send_json({
                        "type": "chat_error",
                        "error": f"Unauthorized: {sender_doc['role']} from dept {sender_doc.get('department_id')} cannot message {receiver_doc['role']} from dept {receiver_doc.get('department_id')}"
                    })
                    continue
                
                # Chat ID (private 1-to-1, sorted for uniqueness)
                chat_id = "_".join(sorted([user_id, receiver_id]))
                
                # Determine initial status: delivered if receiver is online, else sent
                initial_status = "delivered" if manager.is_online(receiver_id) else "sent"
                
                msg_record = {
                    "message_id": f"msg_{uuid.uuid4().hex[:12]}",
                    "chat_id": chat_id,
                    "sender_id": user_id,
                    "sender_name": sender_doc.get("name") or sender_doc.get("full_name", "Unknown"),
                    "sender_role": sender_doc.get("role", ""),
                    "sender_department_id": sender_doc.get("department_id"),
                    "receiver_id": receiver_id,
                    "content": content,
                    "type": msg_type,
                    "file_metadata": file_meta,
                    "reply_to": reply_to,
                    "status": initial_status,
                    "is_pinned": False,
                    "deleted_for": [],
                    "deleted_for_everyone": False,
                    "reactions": {},
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                # Persist to DB
                await db.messages.insert_one({**msg_record})
                
                # Update / upsert Chat Room
                await db.chats.update_one(
                    {"chat_id": chat_id},
                    {
                        "$set": {
                            "last_message": {
                                "content": content[:60] if content else ("📎 File" if file_meta else ""),
                                "sender_id": user_id,
                                "msg_type": msg_type,
                                "created_at": msg_record["created_at"]
                            },
                            "updated_at": msg_record["created_at"]
                        },
                        "$setOnInsert": {
                            "participants": [user_id, receiver_id],
                            "unread_counts": {}
                        }
                    },
                    upsert=True
                )
                
                # Increment unread count for receiver
                await db.chats.update_one(
                    {"chat_id": chat_id},
                    {"$inc": {f"unread_counts.{receiver_id}": 1}}
                )

                # Relay to receiver in real time
                await manager.send(receiver_id, {"type": "new_message", "message": msg_record})
                
                # Confirm delivery to sender (with final status)
                await websocket.send_json({
                    "type": "message_sent",
                    "message_id": msg_record["message_id"],
                    "status": initial_status,
                    "temp_id": data.get("temp_id")  # For optimistic UI reconciliation
                })
                
            # 3. Typing Indicators
            elif data.get("type") == "typing":
                receiver_id = data.get("receiver_id")
                is_typing = data.get("is_typing", False)
                if receiver_id:
                    await manager.send(receiver_id, {
                        "type": "typing",
                        "sender_id": user_id,
                        "is_typing": is_typing
                    })
            
            # 4. Reactions
            elif data.get("type") == "reaction":
                message_id = data.get("message_id")
                emoji = data.get("emoji")
                receiver_id = data.get("receiver_id")
                if message_id and emoji:
                    # Toggle reaction
                    msg = await db.messages.find_one({"message_id": message_id})
                    if msg:
                        reactions = msg.get("reactions", {})
                        users_for_emoji = reactions.get(emoji, [])
                        if user_id in users_for_emoji:
                            users_for_emoji.remove(user_id)
                        else:
                            users_for_emoji.append(user_id)
                        reactions[emoji] = users_for_emoji
                        await db.messages.update_one(
                            {"message_id": message_id},
                            {"$set": {"reactions": reactions}}
                        )
                        # Broadcast reaction update to both participants
                        update = {"type": "reaction_updated", "message_id": message_id, "reactions": reactions, "chat_id": msg["chat_id"]}
                        await manager.send(receiver_id, update)
                        await websocket.send_json(update)

    except WebSocketDisconnect:
        await manager.handle_disconnect(user_id)
    except Exception as e:
        logger.error(f"WS Error for {user_id}: {e}")
        await manager.handle_disconnect(user_id)



