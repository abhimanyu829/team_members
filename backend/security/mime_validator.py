"""
MIME Type Validator
====================
Validates that the uploaded file's declared Content-Type matches the
strict whitelist of allowed MIME types.

NOTE: MIME type alone is NOT trusted — always combine with signature validation.
"""

import logging
from typing import Tuple

logger = logging.getLogger(__name__)

# ─── ALLOWED MIME TYPES WHITELIST ─────────────────────────────────────────────
ALLOWED_MIME_TYPES: dict[str, str] = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "video/mp4": "mp4",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "application/x-zip": "zip",
    "multipart/x-zip": "zip",
}

# ─── BLOCKED MIME TYPES (quick reject) ────────────────────────────────────────
BLOCKED_MIME_TYPES: set[str] = {
    "application/x-msdownload",
    "application/x-executable",
    "application/x-sh",
    "application/x-bat",
    "application/x-msdos-program",
    "application/x-php",
    "application/x-httpd-php",
    "application/x-dll",
    "text/x-sh",
    "text/x-shellscript",
    "application/java-archive",
    "application/vnd.microsoft.portable-executable",
}


def validate_mime(content_type: str | None) -> Tuple[bool, str]:
    """
    Validate a file's declared MIME type against the whitelist.

    Returns:
        (True, normalized_type_key) if allowed
        (False, error_reason) if rejected
    """
    if not content_type:
        logger.warning("MIME validation failed: no content_type provided")
        return False, "Missing MIME type — file type could not be determined"

    # Strip parameters like "; charset=utf-8"
    mime = content_type.split(";")[0].strip().lower()

    if mime in BLOCKED_MIME_TYPES:
        logger.warning(f"MIME validation BLOCKED: {mime}")
        return False, f"Blocked MIME type: {mime}"

    if mime not in ALLOWED_MIME_TYPES:
        logger.warning(f"MIME validation REJECTED (not in whitelist): {mime}")
        return False, f"MIME type not allowed: {mime}"

    allowed_ext = ALLOWED_MIME_TYPES[mime]
    logger.debug(f"MIME validation PASSED: {mime} → {allowed_ext}")
    return True, allowed_ext
