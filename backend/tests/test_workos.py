"""WorkOS Enterprise Platform - Backend API Tests"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    resp = s.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@teamOS.com", "password": "Admin@123"})
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return s

@pytest.fixture(scope="module")
def hod_session():
    s = requests.Session()
    resp = s.post(f"{BASE_URL}/api/auth/login", json={"email": "sarah.miller@teamOS.com", "password": "Hod@123"})
    if resp.status_code != 200:
        pytest.skip(f"HOD login failed: {resp.text}")
    return s

@pytest.fixture(scope="module")
def worker_session():
    s = requests.Session()
    resp = s.post(f"{BASE_URL}/api/auth/login", json={"email": "tom.davis@teamOS.com", "password": "Worker@123"})
    if resp.status_code != 200:
        pytest.skip(f"Worker login failed: {resp.text}")
    return s

# ─── AUTH TESTS ───────────────────────────────────────────────────────────────
class TestAuth:
    def test_admin_login_returns_user(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@teamOS.com", "password": "Admin@123"})
        assert resp.status_code == 200
        data = resp.json()
        # Returns user data directly (cookies set via httpOnly)
        assert data.get("email") or data.get("user")

    def test_hod_login(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "sarah.miller@teamOS.com", "password": "Hod@123"})
        assert resp.status_code == 200

    def test_worker_login(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "tom.davis@teamOS.com", "password": "Worker@123"})
        assert resp.status_code == 200

    def test_invalid_login(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "bad@bad.com", "password": "wrong"})
        assert resp.status_code in [401, 400, 403]

    def test_get_me_with_cookie(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("email", "").lower() == "admin@teamos.com"
        assert data.get("role") == "super_admin"

    def test_hod_role(self, hod_session):
        resp = hod_session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("role") == "hod"

    def test_worker_role(self, worker_session):
        resp = worker_session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("role") == "worker"

# ─── ANALYTICS TESTS ──────────────────────────────────────────────────────────
class TestAnalytics:
    def test_kpis(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/api/analytics/kpis")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        # Check KPI fields exist
        keys = [k.lower() for k in data.keys()]
        assert any("user" in k or "task" in k for k in keys), f"No KPI fields found: {data}"

    def test_department_stats(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/api/analytics/departments")
        assert resp.status_code in [200, 404]

# ─── USERS/ORG TESTS ─────────────────────────────────────────────────────────
class TestUsers:
    def test_get_users(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/api/users")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 5

    def test_get_departments(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/api/departments")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 3  # Engineering, Marketing, Operations

# ─── TASKS TESTS ─────────────────────────────────────────────────────────────
class TestTasks:
    def test_get_tasks(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/api/tasks")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_create_task(self, admin_session):
        payload = {
            "title": "TEST_Task_Pytest",
            "description": "Automated test task",
            "status": "todo",
            "priority": "medium"
        }
        resp = admin_session.post(f"{BASE_URL}/api/tasks", json=payload)
        assert resp.status_code in [200, 201], f"Create task failed: {resp.text}"
        data = resp.json()
        assert data.get("title") == "TEST_Task_Pytest"
        task_id = data.get("id") or data.get("task_id")
        assert task_id

        # Verify task exists in task list (no GET /tasks/{id} endpoint)
        list_resp = admin_session.get(f"{BASE_URL}/api/tasks")
        task_ids = [t.get("id") or t.get("task_id") for t in list_resp.json()]
        assert task_id in task_ids, f"Created task {task_id} not found in tasks list"

    def test_update_task_status(self, admin_session):
        resp = admin_session.post(f"{BASE_URL}/api/tasks", json={
            "title": "TEST_Task_Update",
            "status": "todo",
            "priority": "low"
        })
        assert resp.status_code in [200, 201]
        task_id = resp.json().get("id") or resp.json().get("task_id")

        update_resp = admin_session.put(f"{BASE_URL}/api/tasks/{task_id}", json={"status": "in_progress"})
        assert update_resp.status_code == 200
        assert update_resp.json().get("status") == "in_progress"

# ─── MEETINGS TESTS ───────────────────────────────────────────────────────────
class TestMeetings:
    def test_get_meetings(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/api/meetings")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_create_meeting(self, admin_session):
        payload = {
            "title": "TEST_Meeting_Pytest",
            "start_time": "2026-03-01T10:00:00Z",
            "end_time": "2026-03-01T11:00:00Z",
            "description": "Test meeting"
        }
        resp = admin_session.post(f"{BASE_URL}/api/meetings", json=payload)
        assert resp.status_code in [200, 201], f"Create meeting failed: {resp.text}"

# ─── NOTIFICATIONS TESTS ──────────────────────────────────────────────────────
class TestNotifications:
    def test_get_notifications(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/api/notifications")
        assert resp.status_code == 200

# ─── FILES TESTS ──────────────────────────────────────────────────────────────
class TestFiles:
    def test_get_files(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/api/files")
        assert resp.status_code in [200, 404]

# ─── AI COPILOT TESTS ─────────────────────────────────────────────────────────
class TestAICopilot:
    def test_ai_chat(self, admin_session):
        resp = admin_session.post(f"{BASE_URL}/api/ai/chat", json={"message": "Hello, brief overview"}, timeout=30)
        assert resp.status_code == 200, f"AI chat failed: {resp.text}"
        data = resp.json()
        assert data.get("response") or data.get("message") or data.get("content"), f"No response field: {data}"
