"""
File Validation Orchestrator
==============================
Central entry point for the Takshak file security pipeline.

Runs all validation layers in strict sequence:
  1. File size check
  2. Extension validation (whitelist + double-extension)
  3. MIME type validation (content-type whitelist)
  4. Magic number / signature validation (binary header inspection)
  5. Suspicious filename pattern detection
  6. ZIP deep inspection (if file is a ZIP archive)

Usage:
    from security.file_validator import validate_upload

    result = await validate_upload(
        file_bytes=content,
        filename=file.filename,
        content_type=file.content_type,
        user_id=current_user["user_id"],
    )
    if not result.passed:
        raise HTTPException(400, result.reason)

Returns a ValidationResult with:
  - passed (bool)
  - reason (str)  — human-readable rejection reason
  - flags (dict)  — per-layer results for MongoDB storage
  - safe_filename (str) — UUID-renamed filename for S3 storage
"""

import logging
import os
import uuid
from dataclasses import dataclass, field
from typing import Optional

from security.extension_validator import validate_extension
from security.mime_validator import validate_mime
from security.signature_validator import validate_signature
from security.suspicious_validator import validate_suspicious
from security.zip_inspector import inspect_zip
from security.rate_limiter import upload_rate_limiter

logger = logging.getLogger(__name__)

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
MAX_UPLOAD_SIZE_BYTES: int = int(
    os.environ.get("MAX_UPLOAD_SIZE_MB", "50")
) * 1024 * 1024


# ─── RESULT MODEL ─────────────────────────────────────────────────────────────
@dataclass
class ValidationResult:
    passed: bool
    reason: str = ""
    safe_filename: str = ""          # UUID-renamed filename
    original_filename: str = ""
    flags: dict = field(default_factory=lambda: {
        "mimeValid": False,
        "extensionValid": False,
        "signatureValid": False,
        "zipSafe": None,             # None = not a ZIP, True/False if ZIP
        "suspicious": False,
        "sizeValid": False,
        "rejectionReason": None,
    })

    def to_mongo_flags(self) -> dict:
        """Return flags dict ready for MongoDB storage."""
        return {
            **self.flags,
            "rejectionReason": self.reason if not self.passed else None,
        }


# ─── MAIN VALIDATOR ───────────────────────────────────────────────────────────
async def validate_upload(
    file_bytes: bytes,
    filename: str,
    content_type: Optional[str],
    user_id: str,
    client_ip: str = "unknown",
) -> ValidationResult:
    """
    Run the full validation pipeline on an uploaded file.

    Args:
        file_bytes:    Raw file content bytes
        filename:      Original filename from the client
        content_type:  MIME type declared by the client
        user_id:       Authenticated user ID (for rate limiting)
        client_ip:     Client IP address (for rate limiting fallback)

    Returns:
        ValidationResult — check `.passed` and `.reason`
    """
    result = ValidationResult(
        passed=False,
        original_filename=filename,
    )

    # ── Rate limit check ──────────────────────────────────────────────────
    identity = user_id or client_ip
    rate_ok, rate_msg = upload_rate_limiter.check_and_record(identity)
    if not rate_ok:
        result.reason = rate_msg
        result.flags["rejectionReason"] = rate_msg
        logger.warning(f"Upload rejected (rate limit): user={user_id} ip={client_ip}")
        return result

    # ── Layer 1: File size ─────────────────────────────────────────────────
    file_size = len(file_bytes)
    if file_size == 0:
        result.reason = "Uploaded file is empty (0 bytes)"
        return result

    if file_size > MAX_UPLOAD_SIZE_BYTES:
        size_mb = file_size / (1024 * 1024)
        max_mb = MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)
        result.reason = (
            f"File size {size_mb:.1f}MB exceeds maximum allowed {max_mb:.0f}MB"
        )
        return result

    result.flags["sizeValid"] = True

    # ── Layer 2: Suspicious filename check ─────────────────────────────────
    susp_ok, susp_reason = validate_suspicious(filename)
    result.flags["suspicious"] = not susp_ok
    if not susp_ok:
        result.reason = susp_reason
        return result

    # ── Layer 3: Extension validation ──────────────────────────────────────
    ext_ok, ext_result = validate_extension(filename)
    result.flags["extensionValid"] = ext_ok
    if not ext_ok:
        result.reason = ext_result  # ext_result is the error reason when failed
        return result

    detected_ext = ext_result  # ext_result is the extension string when passed

    # ── Layer 4: MIME type validation ──────────────────────────────────────
    mime_ok, mime_result = validate_mime(content_type)
    result.flags["mimeValid"] = mime_ok
    if not mime_ok:
        result.reason = mime_result
        return result

    # Cross-check: MIME-inferred type must agree with extension
    mime_ext = mime_result  # e.g. "jpg", "pdf", "zip"
    # Normalize jpeg/jpg
    _norm = {"jpeg": "jpg"}
    if _norm.get(detected_ext, detected_ext) != _norm.get(mime_ext, mime_ext):
        mismatch_reason = (
            f"MIME type ({content_type}) does not match file extension (.{detected_ext}). "
            f"MIME suggests .{mime_ext}."
        )
        result.flags["mimeValid"] = False
        result.reason = mismatch_reason
        logger.warning(f"MIME/extension mismatch for {filename!r}: {mismatch_reason}")
        return result

    # ── Layer 5: Magic number / signature validation ─────────────────────
    sig_ok, sig_result = validate_signature(file_bytes, detected_ext)
    result.flags["signatureValid"] = sig_ok
    if not sig_ok:
        result.reason = sig_result
        return result

    # ── Layer 6: ZIP deep inspection ─────────────────────────────────────
    if detected_ext == "zip":
        zip_result = inspect_zip(file_bytes)
        result.flags["zipSafe"] = zip_result.passed
        result.flags["zipStats"] = {
            "fileCount": zip_result.file_count,
            "uncompressedMB": round(
                zip_result.total_uncompressed_bytes / (1024 * 1024), 2
            ),
            "blockedFiles": zip_result.blocked_files,
            "suspiciousPaths": zip_result.suspicious_paths,
            "dangerousContent": zip_result.dangerous_content,
        }
        if not zip_result.passed:
            result.reason = zip_result.reason
            logger.warning(
                f"ZIP inspection FAILED for {filename!r}: {zip_result.reason}"
            )
            return result
    else:
        result.flags["zipSafe"] = None  # N/A for non-ZIP files

    # ── All layers passed — generate safe filename ────────────────────────
    safe_name = f"{uuid.uuid4().hex}.{detected_ext}"
    result.safe_filename = safe_name
    result.passed = True
    result.reason = "Validation passed"

    logger.info(
        f"File validation PASSED: {filename!r} → {safe_name} "
        f"({file_size / 1024:.1f}KB, .{detected_ext})"
    )
    return result
