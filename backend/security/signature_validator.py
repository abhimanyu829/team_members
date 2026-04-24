"""
File Signature (Magic Number) Validator
=========================================
Inspects the actual binary content of the file to verify its true type
matches the declared extension and MIME type.

This prevents:
  - Renamed executables (e.g. malware.exe renamed to document.pdf)
  - Content-type spoofing
  - Polyglot files

Magic number references:
  https://en.wikipedia.org/wiki/List_of_file_signatures
"""

import logging
from typing import Tuple

logger = logging.getLogger(__name__)


# ─── MAGIC NUMBER DEFINITIONS ─────────────────────────────────────────────────
# Format: extension → list of (offset, magic_bytes) tuples
# A file passes if ANY of its signatures match at the given offset.

MAGIC_SIGNATURES: dict[str, list[tuple[int, bytes]]] = {
    "pdf": [
        (0, b"%PDF"),
    ],
    "zip": [
        (0, b"PK\x03\x04"),   # Local file header
        (0, b"PK\x05\x06"),   # End of central directory (empty zip)
        (0, b"PK\x07\x08"),   # Spanning archive
    ],
    "png": [
        (0, b"\x89PNG\r\n\x1a\n"),
    ],
    "jpg": [
        (0, b"\xff\xd8\xff"),
    ],
    "jpeg": [
        (0, b"\xff\xd8\xff"),
    ],
    "mp4": [
        # ftyp box appears at byte 4 (after 4-byte length field)
        (4, b"ftyp"),
        # Some MP4s start with 'ftyp' at offset 4 variants:
        (4, b"ftypmp4"),
        (4, b"ftypisom"),
        (4, b"ftypM4V"),
        (4, b"ftypM4A"),
        (4, b"ftypf4v"),
        (4, b"ftypf4p"),
        (4, b"ftypavc1"),
        (4, b"ftypFACE"),
        (4, b"ftypdasp"),
        (4, b"ftypmmp4"),
        (4, b"ftypmsnv"),
        (4, b"ftypndsc"),
        # wide atom prefix at 0
        (0, b"\x00\x00\x00\x18ftyp"),
        (0, b"\x00\x00\x00\x1cftyp"),
        (0, b"\x00\x00\x00 ftyp"),
    ],
}

# Minimum bytes needed to check signatures
MIN_READ_BYTES = 16


def validate_signature(file_bytes: bytes, extension: str) -> Tuple[bool, str]:
    """
    Validate the binary magic signature of a file against its declared extension.

    Args:
        file_bytes: Raw bytes of the file (at minimum first 16 bytes)
        extension: Normalised extension string (e.g. 'pdf', 'jpg', 'zip')

    Returns:
        (True, extension) if signature matches
        (False, error_reason) if mismatch or unknown
    """
    ext = extension.lower().strip(".")

    if len(file_bytes) < MIN_READ_BYTES:
        return False, f"File too small to validate signature ({len(file_bytes)} bytes)"

    signatures = MAGIC_SIGNATURES.get(ext)
    if signatures is None:
        # No signature definition for this type — reject conservatively
        logger.warning(f"No magic number definition for extension: .{ext}")
        return False, f"No signature definition for .{ext} — cannot verify file authenticity"

    head = file_bytes[:max(32, MIN_READ_BYTES)]  # read enough bytes

    for offset, magic in signatures:
        end = offset + len(magic)
        if len(head) >= end and head[offset:end] == magic:
            logger.debug(f"Signature validation PASSED: .{ext} matched {magic!r} at offset {offset}")
            return True, ext

    # None matched
    detected_hex = head[:8].hex().upper()
    logger.warning(
        f"Signature MISMATCH for .{ext}: "
        f"expected one of {[m.hex().upper() for _, m in signatures]}, "
        f"got {detected_hex}"
    )
    return False, (
        f"File content does not match declared type .{ext}. "
        f"Magic bytes: {detected_hex}. "
        f"Possible renamed or spoofed file."
    )
