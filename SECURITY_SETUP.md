# Takshak-OS — File Security Layer

Production-grade, synchronous, rule-based file validation. **No ClamAV. No AI. No external daemon.**

---

## Architecture

```
Upload Request
    │
    ▼
Rate Limiter (per user/IP)
    │
    ▼
Size Check (configurable MAX_UPLOAD_SIZE_MB)
    │
    ▼
Suspicious Filename Scan (keywords + regex)
    │
    ▼
Extension Validator (whitelist + double-ext detection)
    │
    ▼
MIME Type Validator (whitelist + cross-check with extension)
    │
    ▼
Signature Validator (magic number / binary header)
    │
    ▼ (if ZIP)
ZIP Deep Inspector ──► Zip Slip, bomb protection, dangerous content scan
    │
    ▼
PASS → UUID-renamed file stored in S3 → status: "approved"
FAIL → Rejected immediately, NEVER reaches S3 → status: "rejected"
```

---

## Modules (`backend/security/`)

| Module | Responsibility |
|---|---|
| `file_validator.py` | Pipeline orchestrator — runs all layers in sequence |
| `extension_validator.py` | Whitelist enforcement, double-extension attack detection |
| `mime_validator.py` | MIME type whitelist + blocked type quick-reject |
| `signature_validator.py` | Magic number verification (PDF, JPG, PNG, MP4, ZIP) |
| `suspicious_validator.py` | Filename keyword scan + structural anomaly patterns |
| `zip_inspector.py` | Deep ZIP inspection (Zip Slip, bomb, content scan) |
| `rate_limiter.py` | Per-user/IP upload rate limiting |

---

## Allowed File Types

| Extension | MIME Type |
|---|---|
| pdf | application/pdf |
| jpg / jpeg | image/jpeg |
| png | image/png |
| mp4 | video/mp4 |
| zip | application/zip (+ variants) |

---

## ZIP Inspection Rules

1. **Valid PK signature** — byte-level verification
2. **Zip Slip** — blocks `../` and absolute paths inside archive
3. **File count** — max `MAX_ZIP_FILES` (default: 300)
4. **Uncompressed size** — max `MAX_ZIP_UNCOMPRESSED_MB` (default: 200MB) — prevents ZIP bombs
5. **Blocked extensions inside ZIP** — `.exe`, `.bat`, `.sh`, `.php`, `.dll`, `.cmd`, `.ps1`, `.lnk`, etc.
6. **Suspicious paths** — blocks `.env`, `.git`, `.ssh`, `__MACOSX`, etc.
7. **Script content scan** — scans `.js`, `.ts`, `.py` inside ZIP for `eval()`, `exec()`, `child_process`, `rm -rf`, etc.

---

## MongoDB Schema (`validationFlags`)

```json
{
  "status": "approved | rejected | pending",
  "validationFlags": {
    "sizeValid": true,
    "extensionValid": true,
    "mimeValid": true,
    "signatureValid": true,
    "suspicious": false,
    "zipSafe": true,
    "zipStats": {
      "fileCount": 12,
      "uncompressedMB": 4.2,
      "blockedFiles": [],
      "suspiciousPaths": [],
      "dangerousContent": []
    },
    "rejectionReason": null
  }
}
```

---

## Environment Variables

```env
MAX_UPLOAD_SIZE_MB=50          # Max single-file size (MB)
MAX_ZIP_FILES=300              # Max files inside a ZIP
MAX_ZIP_UNCOMPRESSED_MB=200    # Max decompressed ZIP size (MB)
```

---

## Decommissioning ClamAV

The `takshak-scanner.service` is no longer required:

```bash
sudo systemctl stop takshak-scanner
sudo systemctl disable takshak-scanner
```

`scanner_worker.py` is now a decommission stub — it can be safely removed.
