"""
ClamAV Security Scanner Worker
================================
BullMQ-based background worker that scans uploaded files using ClamAV clamd.
Designed for both Windows (local dev) and Linux (production) deployment.

Start with: python scanner_worker.py
"""

import os
import sys
import signal
import asyncio
import logging
import tempfile
import time
from typing import Optional

import pyclamd
from bullmq import Worker
from redis import asyncio as aioredis
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

# ─── LOGGING ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("scanner_worker")

# ─── ENVIRONMENT ──────────────────────────────────────────────────────────────
MONGO_URL        = os.environ.get("MONGO_URL")
DB_NAME          = os.environ.get("DB_NAME")
REDIS_URL        = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

USE_S3_STORAGE   = os.environ.get("USE_S3_STORAGE", "false").lower() == "true"
AWS_ACCESS_KEY_ID      = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY  = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
AWS_S3_BUCKET_NAME     = os.environ.get("AWS_S3_BUCKET_NAME", "")
AWS_REGION             = os.environ.get("AWS_REGION", "ap-south-1")

USE_LOCAL_STORAGE = os.environ.get("USE_LOCAL_STORAGE", "true").lower() == "true"
LOCAL_STORAGE_PATH = os.environ.get("LOCAL_STORAGE_PATH", "./uploads")

CLAMD_HOST = os.environ.get("CLAMD_HOST", "127.0.0.1")
CLAMD_PORT = int(os.environ.get("CLAMD_PORT", "3310"))

# Max retries if ClamAV is temporarily unavailable
CLAMD_CONNECT_RETRIES = int(os.environ.get("CLAMD_CONNECT_RETRIES", "5"))
CLAMD_RETRY_DELAY_SEC = int(os.environ.get("CLAMD_RETRY_DELAY_SEC", "10"))

# ─── DATABASE ─────────────────────────────────────────────────────────────────
if not MONGO_URL:
    logger.critical("MONGO_URL environment variable is not set. Exiting.")
    sys.exit(1)

mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]

# ─── S3 CLIENT ────────────────────────────────────────────────────────────────
s3_client = None
if USE_S3_STORAGE:
    import boto3
    s3_client = boto3.client(
        "s3",
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
    )
    logger.info(f"S3 storage enabled: bucket={AWS_S3_BUCKET_NAME}, region={AWS_REGION}")
else:
    logger.info(f"Using local storage at: {LOCAL_STORAGE_PATH}")


# ─── CLAMAV CONNECTION ────────────────────────────────────────────────────────
def get_clamd(retries: int = CLAMD_CONNECT_RETRIES) -> Optional[pyclamd.ClamdNetworkSocket]:
    """
    Returns a live clamd connection, with retry logic.
    Tries network socket first (works on both Windows and Linux),
    then falls back to Unix socket (Linux only).
    """
    for attempt in range(1, retries + 1):
        # 1. Try TCP network socket (Windows + Linux)
        try:
            cd = pyclamd.ClamdNetworkSocket(CLAMD_HOST, CLAMD_PORT)
            if cd.ping():
                if attempt > 1:
                    logger.info(f"ClamAV connected on attempt {attempt}.")
                return cd
        except Exception as e:
            logger.warning(f"[Attempt {attempt}/{retries}] TCP socket {CLAMD_HOST}:{CLAMD_PORT} failed: {e}")

        # 2. Try Unix socket fallback (Linux production only)
        try:
            cd = pyclamd.ClamdUnixSocket()
            if cd.ping():
                logger.info("ClamAV connected via Unix socket.")
                return cd
        except Exception:
            pass  # Expected on Windows — not available

        if attempt < retries:
            logger.info(f"Retrying ClamAV connection in {CLAMD_RETRY_DELAY_SEC}s...")
            time.sleep(CLAMD_RETRY_DELAY_SEC)

    logger.error(
        "ClamAV daemon is NOT reachable after all retries. "
        "Ensure clamd is running. See CLAMAV_SETUP.md for instructions."
    )
    return None


def check_clamd_health() -> bool:
    """Quick health-check — used at startup."""
    cd = get_clamd(retries=1)
    return cd is not None


# ─── STORAGE HELPERS ──────────────────────────────────────────────────────────
def get_file_bytes(storage_path: str) -> bytes:
    if USE_S3_STORAGE and s3_client:
        logger.debug(f"Fetching from S3: {storage_path}")
        response = s3_client.get_object(Bucket=AWS_S3_BUCKET_NAME, Key=storage_path)
        return response["Body"].read()
    else:
        for candidate in [storage_path, os.path.join(LOCAL_STORAGE_PATH, storage_path)]:
            if os.path.exists(candidate):
                with open(candidate, "rb") as f:
                    return f.read()
        raise FileNotFoundError(f"File not found locally: {storage_path}")


def delete_file(storage_path: str):
    if USE_S3_STORAGE and s3_client:
        s3_client.delete_object(Bucket=AWS_S3_BUCKET_NAME, Key=storage_path)
        logger.info(f"Deleted from S3: {storage_path}")
    else:
        for candidate in [storage_path, os.path.join(LOCAL_STORAGE_PATH, storage_path)]:
            if os.path.exists(candidate):
                os.remove(candidate)
                logger.info(f"Deleted local file: {candidate}")
                return
        logger.warning(f"Could not find file to delete: {storage_path}")


# ─── JOB PROCESSOR ────────────────────────────────────────────────────────────
async def process_job(job, job_token):
    """
    Main BullMQ job handler.
    Expected job.data: { "collection": "files" | "project_files", "file_id": "..." }
    """
    collection_name: str = job.data.get("collection")
    file_id: str = job.data.get("file_id")
    start_time = time.time()

    logger.info(f"[Job {job.id}] Scanning {collection_name}/{file_id}")

    if not collection_name or not file_id:
        raise ValueError(f"Invalid job data: {job.data}")

    # 1. Fetch the file record from MongoDB
    record = await db[collection_name].find_one({"file_id": file_id})
    if not record:
        raise ValueError(f"File record not found: {collection_name}/{file_id}")

    # Resolve storage path — handles both collections' field naming
    storage_path = (
        record.get("storage_path")
        or record.get("file_path")
        or record.get("file_url")
    )
    if not storage_path:
        raise ValueError(f"No storage path found for file {file_id}")

    loop = asyncio.get_event_loop()

    # 2. Download file bytes
    logger.info(f"[Job {job.id}] Downloading: {storage_path}")
    try:
        file_bytes = await loop.run_in_executor(None, get_file_bytes, storage_path)
    except FileNotFoundError as e:
        # File doesn't exist — mark as rejected immediately
        logger.error(f"[Job {job.id}] File not found in storage: {e}")
        await db[collection_name].update_one(
            {"file_id": file_id},
            {"$set": {"status": "rejected", "scan.clamav": "error", "scan.error": str(e)}}
        )
        return

    file_size_kb = len(file_bytes) / 1024
    logger.info(f"[Job {job.id}] Downloaded {file_size_kb:.1f} KB. Connecting to ClamAV...")

    # 3. Connect to ClamAV (with retries)
    cd = await loop.run_in_executor(None, get_clamd)
    if not cd:
        # Re-queue by raising — BullMQ will retry the job automatically
        raise RuntimeError(
            "ClamAV unavailable. Job will be retried. "
            "Check that clamd is running."
        )

    # 4. Scan the file bytes via instream
    logger.info(f"[Job {job.id}] Scanning with ClamAV...")
    scan_result = await loop.run_in_executor(None, cd.scan_stream, file_bytes)
    elapsed = time.time() - start_time

    if scan_result is None:
        # ✅ SAFE
        logger.info(f"[Job {job.id}] CLEAN ({file_size_kb:.1f} KB in {elapsed:.2f}s)")
        await db[collection_name].update_one(
            {"file_id": file_id},
            {"$set": {
                "status": "approved",
                "scan.clamav": "clean",
                "scan.scanned_at": __import__("datetime").datetime.utcnow().isoformat()
            }}
        )
    else:
        # ❌ INFECTED
        virus_name = list(scan_result.values())[0][1]
        logger.warning(
            f"[Job {job.id}] INFECTED — virus: {virus_name} | "
            f"file: {file_id} | path: {storage_path}"
        )
        # Delete the infected file from storage immediately
        await loop.run_in_executor(None, delete_file, storage_path)

        # Update the database record
        await db[collection_name].update_one(
            {"file_id": file_id},
            {"$set": {
                "status": "rejected",
                "scan.clamav": "infected",
                "scan.virus_name": virus_name,
                "scan.scanned_at": __import__("datetime").datetime.utcnow().isoformat()
            }}
        )

    return {
        "file_id": file_id,
        "result": "clean" if scan_result is None else "infected",
        "elapsed_sec": round(elapsed, 2)
    }


# ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────
shutdown_event = asyncio.Event()

def handle_shutdown(sig, frame):
    logger.info(f"Received signal {sig}. Shutting down worker gracefully...")
    shutdown_event.set()

signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)


# ─── MAIN ─────────────────────────────────────────────────────────────────────
async def main():
    logger.info("=" * 60)
    logger.info("  Takshak — ClamAV File Security Scanner")
    logger.info(f"  Queue   : file_scan_queue")
    logger.info(f"  Redis   : {REDIS_URL}")
    logger.info(f"  ClamAV  : {CLAMD_HOST}:{CLAMD_PORT}")
    logger.info(f"  MongoDB : {DB_NAME}")
    logger.info("=" * 60)

    # Startup health check for ClamAV
    logger.info("Checking ClamAV daemon health...")
    if check_clamd_health():
        logger.info("ClamAV is UP and responding.")
    else:
        logger.warning(
            "ClamAV is NOT reachable at startup. Worker will still start "
            "and retry on each job. Refer to CLAMAV_SETUP.md to start clamd."
        )

    # Connect to Redis and start the BullMQ worker
    redis_conn = aioredis.from_url(REDIS_URL, decode_responses=False)

    worker = Worker(
        "file_scan_queue",
        process_job,
        {
            "connection": redis_conn,
            "concurrency": int(os.environ.get("SCANNER_CONCURRENCY", "3")),
        }
    )
    logger.info("Worker started. Listening for jobs... (Ctrl+C to stop)")

    # Wait until shutdown signal
    await shutdown_event.wait()

    logger.info("Closing worker and database connections...")
    await worker.close()
    mongo_client.close()
    logger.info("Scanner worker stopped cleanly.")


if __name__ == "__main__":
    asyncio.run(main())
