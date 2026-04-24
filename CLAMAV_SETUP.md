# ClamAV Setup Guide

This document covers installing ClamAV for both **local Windows development** and **Linux production** deployment alongside the Takshak platform.

---

## Windows (Local Development)

### Step 1 — Download & Install ClamAV

1. Go to: **https://www.clamav.net/downloads**
2. Download the **Windows 64-bit installer**: `clamav-x.x.x.win.x64.msi`
3. Run the installer. Default path: `C:\Program Files\ClamAV\`

### Step 2 — Configure ClamAV

After installation, copy the example config files and edit them:

```powershell
cd "C:\Program Files\ClamAV"
copy .\conf_examples\clamd.conf.sample .\clamd.conf
copy .\conf_examples\freshclam.conf.sample .\freshclam.conf
```

**Edit `clamd.conf`** — open in Notepad and make these changes:

```
# Comment out or remove this line:
# Example

# Add/uncomment these:
TCPSocket 3310
TCPAddr 127.0.0.1
LogFile "C:\Program Files\ClamAV\clamd.log"
DatabaseDirectory "C:\Program Files\ClamAV\database"
```

**Edit `freshclam.conf`** — open in Notepad and make these changes:

```
# Comment out or remove this line:
# Example

# Add/uncomment this:
DatabaseDirectory "C:\Program Files\ClamAV\database"
```

### Step 3 — Create the Database Directory

```powershell
mkdir "C:\Program Files\ClamAV\database"
```

### Step 4 — Download Virus Definitions

```powershell
cd "C:\Program Files\ClamAV"
.\freshclam.exe
```

> This will download ~400MB of virus definitions. Wait until it completes.

### Step 5 — Start the ClamAV Daemon

```powershell
cd "C:\Program Files\ClamAV"
.\clamd.exe
```

Keep this terminal open, or install it as a Windows Service (Step 6).

### Step 6 — (Optional) Run as a Windows Service

```powershell
# Run as Administrator
sc create ClamAV binPath= "\"C:\Program Files\ClamAV\clamd.exe\" --config-file=\"C:\Program Files\ClamAV\clamd.conf\"" start= auto
sc start ClamAV
```

### Step 7 — Verify

```powershell
python -c "import pyclamd; cd = pyclamd.ClamdNetworkSocket('127.0.0.1', 3310); print('OK:', cd.ping(), '|', cd.version())"
```

You should see: `OK: True | ClamAV x.x.x/...`

---

## Linux (Production Server)

### Step 1 — Install ClamAV

```bash
# Ubuntu / Debian
sudo apt-get update
sudo apt-get install -y clamav clamav-daemon

# CentOS / RHEL / Amazon Linux
sudo yum install -y epel-release
sudo yum install -y clamav clamav-update clamd
```

### Step 2 — Update Virus Definitions

```bash
# Stop freshclam if running, then update
sudo systemctl stop clamav-freshclam
sudo freshclam
sudo systemctl start clamav-freshclam
```

### Step 3 — Configure clamd

Edit `/etc/clamav/clamd.conf` (or `/etc/clamd.d/scan.conf` on RHEL):

```bash
sudo nano /etc/clamav/clamd.conf
```

Ensure these lines are present:

```
TCPSocket 3310
TCPAddr 127.0.0.1
LocalSocket /var/run/clamav/clamd.ctl
```

### Step 4 — Start & Enable clamd

```bash
# Ubuntu/Debian
sudo systemctl enable clamav-daemon
sudo systemctl start clamav-daemon
sudo systemctl status clamav-daemon

# RHEL/CentOS
sudo systemctl enable clamd@scan
sudo systemctl start clamd@scan
```

### Step 5 — Verify

```bash
python3 -c "import pyclamd; cd = pyclamd.ClamdNetworkSocket('127.0.0.1', 3310); print('OK:', cd.ping())"
```

---

## Running the Scanner Worker

### Start Redis (Required)

**Windows (dev):**
```powershell
# Download and start Redis for Windows:
# https://github.com/microsoftarchive/redis/releases
redis-server
```

**Linux (production):**
```bash
sudo apt-get install -y redis-server
sudo systemctl enable redis
sudo systemctl start redis
```

### Start the Scanner Worker

```bash
python scanner_worker.py
```

### Environment Variables (`.env`)

Add these to your `.env` file:

```env
# Redis
REDIS_URL=redis://localhost:6379/0

# ClamAV
CLAMD_HOST=127.0.0.1
CLAMD_PORT=3310
CLAMD_CONNECT_RETRIES=5
CLAMD_RETRY_DELAY_SEC=10

# Scanner concurrency (parallel scan jobs)
SCANNER_CONCURRENCY=3
```

---

## Linux Production — Run as a systemd Service

Create the service file:

```bash
sudo nano /etc/systemd/system/takshak-scanner.service
```

Paste the following (update paths as needed):

```ini
[Unit]
Description=Takshak File Security Scanner Worker
After=network.target mongod.service redis.service clamav-daemon.service
Requires=redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/takshak/backend
ExecStart=/usr/bin/python3 /var/www/takshak/backend/scanner_worker.py
Restart=always
RestartSec=10
EnvironmentFile=/var/www/takshak/backend/.env
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable takshak-scanner
sudo systemctl start takshak-scanner
sudo systemctl status takshak-scanner

# View live logs
sudo journalctl -u takshak-scanner -f
```

---

## Automatic Virus Definition Updates (Production)

Add a daily cron job to keep definitions fresh:

```bash
sudo crontab -e
```

Add this line:

```
0 3 * * * /usr/bin/freshclam --quiet && systemctl restart clamav-daemon
```

---

## Testing the Scanner

Upload the standard **EICAR test file** (a safe file that every antivirus treats as a test virus):

```bash
# EICAR test string — will be flagged as EICAR-Test-File
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar.txt
python -c "
import pyclamd
cd = pyclamd.ClamdNetworkSocket('127.0.0.1', 3310)
with open('/tmp/eicar.txt', 'rb') as f:
    result = cd.scan_stream(f.read())
print('INFECTED' if result else 'CLEAN', result)
"
```

Expected output: `INFECTED {'stream': ('FOUND', 'Eicar-Signature')}`
