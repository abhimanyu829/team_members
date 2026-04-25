# Takshak Workspace Management Platform

TeamOS is a modern, decoupled workforce orchestration platform. It is built to run entirely autonomously without relying on external SaaS platforms (like Emergent AI) by leveraging standard, self-hosted open-source technologies.

## Tech Stack
-   **Frontend:** React, TailwindCSS, Radix UI components (running on port `3000`)
-   **Backend:** Python, FastAPI, Motor (asyncio MongoDB driver) (running on port `8000`)
-   **Database:** MongoDB
-   **Object Storage:** Local filesystem storage (`/backend/uploads`)
-   **Authentication:** JWT-based email/password authentication (fully self-contained)

## Offline / Standalone Architecture

This project has been completely sanitized of heavily-coupled API dependencies. 

1.  **AI Chatbot:** The AI Copilot previously required the Emergent `llm` wrapper. This has been removed. You can now insert your own generic AI chat API (e.g., OpenAI, Gemini, or Claude SDK) into `server.py` at the `@api_router.post("/ai/chat")` endpoint. 
2.  **Database:** The application uses pure MongoDB natively. 
3.  **Storage:** The system now drops uploaded files directly into a server-side `uploads` directory and serves them directly without sending items into a cloud CDN.

## Quick Start Configuration

### 1. Database Setup
Ensure you have MongoDB running locally (default: `localhost:27017` without auth).

### 2. Backend Environment Setup (`backend/.env`)
Create or edit your `.env` in the `backend/` directory:
```env
# Database Config
MONGO_URL=mongodb://localhost:27017
DB_NAME=workos_db

# Security & Auth
JWT_SECRET=your_super_secret_jwt_key
FRONTEND_URL=http://localhost:3000

# File Storage Configuration
USE_LOCAL_STORAGE=true
LOCAL_STORAGE_PATH=./uploads

# AI Chat API Key (Place your standard API key here)
# OPENAI_API_KEY=sk_...
```

### 3. Run the Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```
*Note: Upon startup, the system will execute an idempotent DB seeding script that generates departments, dummy tasks, and initial users (like `admin@teamOS.com` with password `Admin@123`).*

### 4. Run the Frontend
```bash
cd frontend
yarn install
yarn start
```
Go to `http://localhost:3000` to start exploring the stand-alone system.
