"""
Suspicious Filename Validator
===============================
Detects suspicious patterns in filenames that indicate potential
malicious intent (payload delivery, script execution attempts, etc.).

This does NOT attempt to scan file content — it only inspects the
filename string itself.
"""

import logging
import re
from typing import Tuple

logger = logging.getLogger(__name__)

# ─── SUSPICIOUS KEYWORD PATTERNS IN FILENAMES ─────────────────────────────────
# These keywords in a filename indicate potential malicious intent.
SUSPICIOUS_FILENAME_KEYWORDS: set[str] = {
    "script",
    "exec",
    "shell",
    "payload",
    "exploit",
    "dropper",
    "injector",
    "backdoor",
    "rootkit",
    "keylogger",
    "ransomware",
    "malware",
    "virus",
    "trojan",
    "bypass",
    "reverse",
    "crypter",
    "stager",
    "obfuscate",
    "deobfuscate",
    "base64decode",
    "cmd",
    "powershell",
    "wget",
    "curl",
    "nc",        # netcat
    "ncat",
    "nmap",
    "metasploit",
    "mimikatz",
}

# ─── SUSPICIOUS FILENAME PATTERN RULES ────────────────────────────────────────
# Compiled regex patterns for structural anomalies in filenames.
SUSPICIOUS_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Multiple dots in the name (excluding known archive patterns like tar.gz)
    (
        re.compile(r"\.[a-zA-Z0-9]{2,4}\.[a-zA-Z0-9]{2,4}$"),
        "Multiple file extensions detected (possible double-extension attack)",
    ),
    # Null bytes or control characters in filename
    (
        re.compile(r"[\x00-\x1f\x7f]"),
        "Null bytes or control characters detected in filename",
    ),
    # Very long filenames (>255 chars, OS-level max)
    (
        re.compile(r".{256,}"),
        "Filename exceeds maximum allowed length (255 chars)",
    ),
    # Path traversal sequences
    (
        re.compile(r"\.\.(\/|\\)"),
        "Path traversal sequence detected in filename",
    ),
    # Windows special device names
    (
        re.compile(
            r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$",
            re.IGNORECASE
        ),
        "Windows reserved device name detected in filename",
    ),
]


def validate_suspicious(filename: str) -> Tuple[bool, str]:
    """
    Check filename for suspicious keywords and structural patterns.

    Args:
        filename: Original filename from the upload

    Returns:
        (True, "ok") if filename is clean
        (False, reason) if suspicious pattern detected
    """
    if not filename:
        return False, "Filename is empty"

    name_lower = filename.lower().strip()

    # ── Check 1: Suspicious keywords ──────────────────────────────────────
    for keyword in SUSPICIOUS_FILENAME_KEYWORDS:
        # Match as whole word or substring (filenames are generally short)
        if keyword in name_lower:
            logger.warning(
                f"Suspicious keyword '{keyword}' detected in filename: {filename!r}"
            )
            return False, (
                f"Suspicious keyword detected in filename: '{keyword}'. "
                f"File rejected for security reasons."
            )

    # ── Check 2: Regex pattern anomalies ──────────────────────────────────
    for pattern, reason in SUSPICIOUS_PATTERNS:
        if pattern.search(filename):
            logger.warning(
                f"Suspicious pattern matched in filename {filename!r}: {reason}"
            )
            return False, reason

    logger.debug(f"Suspicious filename check PASSED: {filename!r}")
    return True, "ok"
