"""
Extension Validator
====================
Validates file extensions against a strict whitelist.
Also detects double-extension attacks (e.g. file.pdf.exe).
"""

import logging
import os
from typing import Tuple

logger = logging.getLogger(__name__)

# ─── ALLOWED EXTENSIONS ────────────────────────────────────────────────────────
ALLOWED_EXTENSIONS: set[str] = {
    "pdf",
    "jpg",
    "jpeg",
    "png",
    "mp4",
    "zip",
}

# ─── BLOCKED EXTENSIONS (immediate reject) ─────────────────────────────────────
BLOCKED_EXTENSIONS: set[str] = {
    "exe", "bat", "sh", "php", "dll",
    "cmd", "msi", "vbs", "ps1", "jar",
    "com", "scr", "hta", "pif", "reg",
    "ws", "wsf", "wsh", "cpl", "inf",
    "js",   # standalone js files blocked at top level (allowed only inside ZIP)
    "ts",   # same
    "py",   # same
}


def _extract_all_extensions(filename: str) -> list[str]:
    """
    Extract ALL extensions from a filename.
    'report.pdf.exe' → ['pdf', 'exe']
    'archive.tar.gz' → ['tar', 'gz']
    """
    name = os.path.basename(filename).lower()
    parts = name.split(".")
    if len(parts) <= 1:
        return []
    return [p.strip() for p in parts[1:] if p.strip()]


def validate_extension(filename: str) -> Tuple[bool, str]:
    """
    Validate a filename's extension(s).

    Rules:
    1. Must have at least one extension.
    2. Must NOT contain multiple extensions (double-extension attack).
    3. Final (and only) extension must be in the allowed list.
    4. No extension may be in the blocked list.

    Returns:
        (True, extension) if valid
        (False, error_reason) if rejected
    """
    if not filename:
        return False, "Filename is empty"

    name = os.path.basename(filename).strip()

    # Reject hidden files (start with dot, no other content)
    if name.startswith(".") and len(name) == 1:
        return False, "Hidden files not allowed"

    all_exts = _extract_all_extensions(name)

    if not all_exts:
        return False, f"File has no extension: {name}"

    # ── Rule 1: Detect double-extension attack ──────────────────────────────
    if len(all_exts) > 1:
        logger.warning(f"Double-extension detected in: {name} → {all_exts}")
        return False, (
            f"Double-extension attack detected: {name!r}. "
            f"Multiple extensions found: {all_exts}. Rejected."
        )

    final_ext = all_exts[-1].lower()

    # ── Rule 2: Block explicitly dangerous extensions ───────────────────────
    if final_ext in BLOCKED_EXTENSIONS:
        logger.warning(f"Blocked extension rejected: .{final_ext} in {name}")
        return False, f"Blocked file extension: .{final_ext}"

    # ── Rule 3: Must be in allowed whitelist ────────────────────────────────
    if final_ext not in ALLOWED_EXTENSIONS:
        logger.warning(f"Extension not in whitelist: .{final_ext} in {name}")
        return False, f"File extension not allowed: .{final_ext}. Allowed: {sorted(ALLOWED_EXTENSIONS)}"

    logger.debug(f"Extension validation PASSED: {name} → .{final_ext}")
    return True, final_ext
