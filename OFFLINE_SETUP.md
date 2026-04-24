# Takshak — Local & Production Setup Guide

Takshak is a self-contained enterprise workforce management platform. This guide covers running it fully offline/locally as well as deploying it to a production Linux server.

---

## Prerequisites

| Service   | Required | Notes |
|-----------|----------|-------|
| Python 3.10+ | Yes | Backend runtime |
| Node.js 18+ | Yes | Frontend runtime |
| MongoDB | Yes | Default port `27017` |
| Redis | Yes | Required by file security scanner (BullMQ). Default port `6379` |
| ClamAV | Yes | File security scanning daemon. See `CLAMAV_SETUP.md` |

---

## Quick Start (Local Development)

### 1. Configure Environment

Copy the example env file and fill in your values:
```bash
cd backend
cp .env.example .env
```

Minimum required values for local use:
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=takshak_db
JWT_SECRET=any_random_secret_string
FRONTEND_URL=http://localhost:3000
USE_LOCAL_STORAGE=true
LOCAL_STORAGE_PATH=./uploads
REDIS_URL=redis://localhost:6379/0
CLAMD_HOST=127.0.0.1
CLAMD_PORT=3310
```

### 2. Start Redis

**Windows:** Download from https://github.com/microsoftarchive/redis/releases and run `redis-server.exe`

**Linux/macOS:**
```bash
sudo systemctl start redis
```

### 3. Start ClamAV

See `CLAMAV_SETUP.md` for full instructions. Quick summary:

**Windows:** Install from https://www.clamav.net/downloads, run `freshclam.exe` to update definitions, then `clamd.exe`

**Linux:**
```bash
sudo systemctl start clamav-daemon
```

### 4. Start the Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Start the File Security Scanner Worker

Open a **separate terminal** and run:
```bash
cd backend
python scanner_worker.py
```

This worker listens to the BullMQ queue and scans every uploaded file with ClamAV. Files remain `pending` until scanned, then become `approved` (safe) or `rejected` (infected).

### 6. Start the Frontend
```bash
cd frontend
npm install
npm run start
```

---

## Production Deployment (Linux Server)

### Services to deploy:
1. `uvicorn server:app` — FastAPI backend (use Gunicorn + Nginx in production)
2. `python scanner_worker.py` — ClamAV scanner worker (run as a systemd service)

### Install the scanner as a systemd service:
```bash
# Copy the service file (edit paths inside it first)
sudo cp backend/takshak-scanner.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable takshak-scanner
sudo systemctl start takshak-scanner

# View logs
sudo journalctl -u takshak-scanner -f
```

Full production ClamAV setup: see `CLAMAV_SETUP.md`

---

## File Security Pipeline

Every uploaded file goes through this lifecycle:

```
Upload → status: "pending" → BullMQ job enqueued → ClamAV scan
         ↓                                            ↓
    Access blocked                          Clean → status: "approved" (accessible)
                                         Infected → status: "rejected" + deleted from S3
```

---

## Changes Made to Enable Offline Capabilities
- **Local Filesystem Storage:** Uploaded files go to `backend/uploads/` when S3 is not configured.
- **Primary Auth Flow:** Local credential-based accounts (email/password) are fully functional. Google OAuth is disabled without Emergent AI.
- **Graceful AI Degradation:** If no LLM key is present, the AI Copilot returns a fallback message without crashing.
- **File Security Scanner:** All uploads are scanned post-upload by ClamAV via a BullMQ worker — non-blocking and production-ready.
