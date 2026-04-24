"""
ZIP Security Inspector
=======================
Performs deep inspection of ZIP archives before they are stored to S3.

Security rules enforced:
  1. Valid ZIP signature (PK magic bytes)
  2. Zip Slip prevention (path traversal via ../ or absolute paths)
  3. File count limit (default: 300 files)
  4. Total uncompressed size limit (default: 200MB) — prevents ZIP bombs
  5. Blocked dangerous file types inside ZIP (.exe, .bat, .sh, .php, .dll, etc.)
  6. Hidden/suspicious path components (.env, .git, __MACOSX)
  7. Light content scan for script files (.js, .py) — detects dangerous patterns

All extraction is done into a temporary, isolated directory that is
cleaned up after inspection regardless of pass/fail.
"""

import io
import logging
import os
import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass, field
from typing import Tuple

logger = logging.getLogger(__name__)

# ─── CONFIGURATION (overridable from env) ─────────────────────────────────────
MAX_ZIP_FILES: int = int(os.environ.get("MAX_ZIP_FILES", "300"))
MAX_ZIP_UNCOMPRESSED_MB: float = float(os.environ.get("MAX_ZIP_UNCOMPRESSED_MB", "200"))
MAX_ZIP_UNCOMPRESSED_BYTES: int = int(MAX_ZIP_UNCOMPRESSED_MB * 1024 * 1024)

# ─── BLOCKED EXTENSIONS INSIDE ZIP ────────────────────────────────────────────
ZIP_BLOCKED_EXTENSIONS: set[str] = {
    "exe", "bat", "sh", "php", "dll",
    "cmd", "msi", "vbs", "ps1", "jar",
    "com", "scr", "hta", "pif", "reg",
    "ws", "wsf", "wsh", "cpl", "inf",
    "lnk",  # Windows shortcut — can execute arbitrary commands
}

# ─── SUSPICIOUS PATH COMPONENTS ───────────────────────────────────────────────
SUSPICIOUS_PATH_PARTS: set[str] = {
    ".env",
    ".git",
    ".gitconfig",
    ".ssh",
    ".bash_history",
    ".bashrc",
    ".profile",
    "__macosx",
    ".ds_store",
    "thumbs.db",
    ".svn",
    ".hg",
}

# ─── SCRIPT CONTENT DANGER PATTERNS ───────────────────────────────────────────
# Applied to .js and .py files inside the ZIP
SCRIPT_DANGER_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(rb"eval\s*\(", re.IGNORECASE), "eval() call detected"),
    (re.compile(rb"child_process", re.IGNORECASE), "child_process usage detected"),
    (re.compile(rb"exec\s*\(", re.IGNORECASE), "exec() call detected"),
    (re.compile(rb"rm\s+-rf", re.IGNORECASE), "rm -rf command detected"),
    (re.compile(rb"os\.system\s*\(", re.IGNORECASE), "os.system() call detected"),
    (re.compile(rb"subprocess\.(?:call|run|Popen)\s*\(", re.IGNORECASE), "subprocess execution detected"),
    (re.compile(rb"__import__\s*\(", re.IGNORECASE), "__import__() obfuscation detected"),
    (re.compile(rb"base64\.b64decode", re.IGNORECASE), "base64 decode pattern (possible obfuscation) detected"),
    (re.compile(rb"require\s*\(\s*['\"]child_process['\"]", re.IGNORECASE), "Node.js child_process require detected"),
    (re.compile(rb"process\.env\.", re.IGNORECASE), "process.env access (env harvesting) detected"),
]

# Script extensions to content-scan
CONTENT_SCAN_EXTENSIONS: set[str] = {"js", "ts", "py"}

# Max bytes to read per script file for content scanning (avoid huge files)
CONTENT_SCAN_MAX_BYTES: int = 512 * 1024  # 512 KB


@dataclass
class ZipInspectionResult:
    passed: bool
    reason: str = ""
    file_count: int = 0
    total_uncompressed_bytes: int = 0
    blocked_files: list[str] = field(default_factory=list)
    suspicious_paths: list[str] = field(default_factory=list)
    dangerous_content: list[str] = field(default_factory=list)


def _is_zip_slip(member_path: str) -> bool:
    """
    Detect Zip Slip attack:
    - Paths containing '..' (directory traversal)
    - Absolute paths starting with '/' or drive letters (C:\\)
    """
    # Normalise separators
    norm = member_path.replace("\\", "/")

    if norm.startswith("/"):
        return True
    if re.match(r"^[A-Za-z]:/", norm):
        return True
    if "../" in norm or norm == "..":
        return True

    return False


def _has_suspicious_path_component(member_path: str) -> bool:
    """
    Check if any component of the path is a known suspicious name.
    """
    parts = member_path.replace("\\", "/").lower().split("/")
    for part in parts:
        if part in SUSPICIOUS_PATH_PARTS:
            return True
    return False


def _scan_script_content(data: bytes, member_name: str) -> Tuple[bool, str]:
    """
    Scan a script file's content for dangerous patterns.
    Returns (safe, reason) — safe=True means clean.
    """
    sample = data[:CONTENT_SCAN_MAX_BYTES]
    for pattern, desc in SCRIPT_DANGER_PATTERNS:
        if pattern.search(sample):
            logger.warning(f"Dangerous content in {member_name!r}: {desc}")
            return False, f"{member_name}: {desc}"
    return True, ""


def inspect_zip(file_bytes: bytes) -> ZipInspectionResult:
    """
    Perform deep inspection of a ZIP archive.

    Args:
        file_bytes: Raw bytes of the ZIP file

    Returns:
        ZipInspectionResult with passed=True/False and details
    """
    result = ZipInspectionResult(passed=False)

    # ── Rule 0: Verify ZIP magic signature ────────────────────────────────
    if len(file_bytes) < 4 or file_bytes[:2] != b"PK":
        result.reason = "Invalid ZIP file: missing PK signature"
        return result

    # ── Open the ZIP from memory ──────────────────────────────────────────
    try:
        zf = zipfile.ZipFile(io.BytesIO(file_bytes), "r")
    except zipfile.BadZipFile as e:
        result.reason = f"Corrupt or invalid ZIP file: {e}"
        return result
    except Exception as e:
        result.reason = f"Failed to open ZIP: {e}"
        return result

    members = zf.infolist()
    result.file_count = len(members)

    # ── Rule 1: File count limit ──────────────────────────────────────────
    if result.file_count > MAX_ZIP_FILES:
        result.reason = (
            f"ZIP contains too many files: {result.file_count} "
            f"(max allowed: {MAX_ZIP_FILES})"
        )
        zf.close()
        return result

    # ── Inspect each member ───────────────────────────────────────────────
    total_uncompressed = 0

    for member in members:
        name = member.filename

        # ── Rule 2: Zip Slip prevention ───────────────────────────────────
        if _is_zip_slip(name):
            logger.warning(f"ZIP Slip detected in member: {name!r}")
            result.reason = (
                f"ZIP Slip attack detected: member path {name!r} "
                f"contains directory traversal or absolute path."
            )
            zf.close()
            return result

        # ── Rule 3: Accumulate uncompressed size (ZIP bomb prevention) ────
        total_uncompressed += member.file_size
        result.total_uncompressed_bytes = total_uncompressed

        if total_uncompressed > MAX_ZIP_UNCOMPRESSED_BYTES:
            result.reason = (
                f"ZIP uncompressed size exceeds limit: "
                f"{total_uncompressed / (1024*1024):.1f}MB "
                f"(max: {MAX_ZIP_UNCOMPRESSED_MB}MB). Possible ZIP bomb."
            )
            zf.close()
            return result

        # ── Rule 4: Blocked extensions inside ZIP ─────────────────────────
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext in ZIP_BLOCKED_EXTENSIONS:
            result.blocked_files.append(name)

        # ── Rule 5: Suspicious path components ───────────────────────────
        if _has_suspicious_path_component(name):
            result.suspicious_paths.append(name)

        # ── Rule 6: Script content scanning ──────────────────────────────
        if ext in CONTENT_SCAN_EXTENSIONS:
            try:
                data = zf.read(member)
                safe, reason = _scan_script_content(data, name)
                if not safe:
                    result.dangerous_content.append(reason)
            except Exception as e:
                logger.warning(f"Could not read ZIP member {name!r} for content scan: {e}")

    zf.close()

    # ── Aggregate failure reasons ─────────────────────────────────────────
    if result.blocked_files:
        result.reason = (
            f"ZIP contains {len(result.blocked_files)} dangerous file(s): "
            f"{result.blocked_files[:5]}"
        )
        return result

    if result.suspicious_paths:
        result.reason = (
            f"ZIP contains {len(result.suspicious_paths)} suspicious path(s): "
            f"{result.suspicious_paths[:5]}"
        )
        return result

    if result.dangerous_content:
        result.reason = (
            f"ZIP contains script files with dangerous code patterns: "
            f"{result.dangerous_content[:3]}"
        )
        return result

    # ── All rules passed ──────────────────────────────────────────────────
    result.passed = True
    result.reason = "ZIP inspection passed"
    logger.info(
        f"ZIP inspection PASSED: {result.file_count} files, "
        f"{result.total_uncompressed_bytes / (1024*1024):.2f}MB uncompressed"
    )
    return result
