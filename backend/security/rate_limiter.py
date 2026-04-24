"""
Rate Limiter
=============
In-memory per-user/IP upload rate limiter.
Prevents upload flooding and abuse of the file upload endpoints.

Configuration (env vars):
  RATE_LIMIT_MAX_UPLOADS   — max uploads allowed in the window (default: 20)
  RATE_LIMIT_WINDOW_SEC    — rolling window in seconds (default: 60)

Thread-safety: uses a lock since FastAPI runs async but may use
a thread pool for sync tasks.
"""

import logging
import os
import threading
import time
from collections import defaultdict, deque
from typing import Tuple

logger = logging.getLogger(__name__)

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
RATE_LIMIT_MAX_UPLOADS: int = int(os.environ.get("RATE_LIMIT_MAX_UPLOADS", "20"))
RATE_LIMIT_WINDOW_SEC: int = int(os.environ.get("RATE_LIMIT_WINDOW_SEC", "60"))


class UploadRateLimiter:
    """
    Sliding-window in-memory rate limiter for file uploads.

    Tracks upload timestamps per user_id or IP address.
    Automatically evicts old entries outside the window.
    """

    def __init__(
        self,
        max_uploads: int = RATE_LIMIT_MAX_UPLOADS,
        window_sec: int = RATE_LIMIT_WINDOW_SEC,
    ):
        self.max_uploads = max_uploads
        self.window_sec = window_sec
        self._store: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check_and_record(self, identity: str) -> Tuple[bool, str]:
        """
        Check if this identity (user_id or IP) is within rate limit.
        Records the current attempt if allowed.

        Args:
            identity: Unique identifier string (user_id or IP address)

        Returns:
            (True, "ok") if within limit
            (False, error_message) if rate limit exceeded
        """
        now = time.monotonic()
        cutoff = now - self.window_sec

        with self._lock:
            timestamps = self._store[identity]

            # Evict timestamps outside the rolling window
            while timestamps and timestamps[0] < cutoff:
                timestamps.popleft()

            count = len(timestamps)

            if count >= self.max_uploads:
                remaining_sec = int(self.window_sec - (now - timestamps[0]))
                logger.warning(
                    f"Rate limit exceeded for {identity!r}: "
                    f"{count}/{self.max_uploads} uploads in last {self.window_sec}s"
                )
                return False, (
                    f"Upload rate limit exceeded: {count} uploads in the last "
                    f"{self.window_sec} seconds. "
                    f"Please wait ~{remaining_sec}s before uploading again."
                )

            # Record this upload
            timestamps.append(now)

        logger.debug(
            f"Rate limit OK for {identity!r}: "
            f"{count + 1}/{self.max_uploads} uploads in window"
        )
        return True, "ok"

    def reset(self, identity: str) -> None:
        """Manually clear rate limit for an identity (admin use)."""
        with self._lock:
            self._store.pop(identity, None)

    def stats(self, identity: str) -> dict:
        """Return current usage stats for an identity."""
        now = time.monotonic()
        cutoff = now - self.window_sec
        with self._lock:
            timestamps = self._store.get(identity, deque())
            active = [t for t in timestamps if t >= cutoff]
        return {
            "identity": identity,
            "uploads_in_window": len(active),
            "max_uploads": self.max_uploads,
            "window_sec": self.window_sec,
            "remaining": max(0, self.max_uploads - len(active)),
        }


# ─── GLOBAL SINGLETON ─────────────────────────────────────────────────────────
upload_rate_limiter = UploadRateLimiter()
