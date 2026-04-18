# Stand-alone / Offline Setup for TeamOS

TeamOS was originally designed to run tightly coupled with Emergent AI services (storage, AI copilot, centralized OAuth). This guide outlines how it has been decoupled so it can run securely and efficiently without these external services.

## Quick Start
1. Ensure `python` and `node` are available. MongoDB should be running locally on its standard port `27017`.
2. Open the `backend/.env` file. It comes pre-configured for local storage:
   ```env
   # WorkOS Target Environment
   MONGO_URL=mongodb://localhost:27017
   DB_NAME=workos_db
   JWT_SECRET=super-secret-local-key
   FRONTEND_URL=http://localhost:3000

   # Emergent AI (Optional - Set if using Emergent)
   # EMERGENT_LLM_KEY=your_key_here

   # Storage
   USE_LOCAL_STORAGE=true
   LOCAL_STORAGE_PATH=./uploads
   ```
3. Start the Backend:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn server:app --host 0.0.0.0 --port 8000 --reload
   ```
4. Start the Frontend:
   ```bash
   cd frontend
   yarn install
   yarn start
   ```

## Changes Made to Enable Offline Capabilities
- **Local Filesystem Storage:** The object storage API that connected to Emergent's Cloud Object Store has been updated to use the local filesystem. Uploaded files like profile pictures and task attachments go straight into `backend/uploads/`.
- **Primary Auth Flow:** The Google OAuth sign-in button is mocked to display an alert. Local credential-based accounts (email/password) are prioritized and fully functional. There is an included seeder sequence that sets up a full demo hierarchy.
- **Graceful AI Degradation:** If `EMERGENT_LLM_KEY` is not present, the `teamOS AI Copilot` safely returns a fallback message. This prevents application crashes when requesting chat generations.
- **Visual Edits Deprecation:** The dependency on `@emergentbase/visual-edits` was safely excised, enabling standard CRA builds and standard local development without an Emergent connection string.

Enjoy building with TeamOS locally!
