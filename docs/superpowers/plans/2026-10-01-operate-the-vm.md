# Run career-platform as a Real Service

**Goal:** Turn the hand-started app into a service that starts on boot, restarts itself after a crash, and is reachable at `http://PUBLIC-IP` with no port number — without exposing port 8000 or running the app as root.

**Target VM:**
- VM: `vm-career-platform` (resource group `RG-CAREER-PLATFORM`, region Denmark East)
- Public IP: `9.205.26.169`
- SSH: `ssh azureuser@9.205.26.169` (only works from the whitelisted laptop IP — see NSG rule `Allow-SSH-Laptop`)
- Repo on VM: `/home/azureuser/career-platform` (branch `python-fastapi`, already cloned, `.venv` already synced via `uv`)
- App entrypoint: `uv run uvicorn app.main:app`, health check `GET /api/health`
- `uv` binary: `/home/azureuser/.local/bin/uv`
- Network already confirmed: NSG `vm-career-platform-nsg` allows inbound 22 (from your laptop only) and 80 (from anywhere, rule `Allow-HTTP-80`, which you're adding/already added yourself) — **nothing opens 8000**, and that's intentional.

**How this meets your three requirements:**
- *No port number for visitors* — `nginx` listens on port 80 (already allowed in) and silently forwards each request to the app on `127.0.0.1:8000`, an address only reachable from inside the VM.
- *Starts on boot / comes back after a crash* — both `nginx` and the app become **systemd services**. Systemd starts both automatically when the VM boots, and restarts either one automatically a few seconds after it dies.
- *One crash doesn't take the whole site down* — `nginx` and the app are two independent processes. If the app crashes, systemd restarts just the app (~3 seconds); `nginx` itself never goes down, so the VM keeps answering on port 80 the whole time (visitors see a brief error page instead of "connection refused," and it recovers on its own). *App doesn't run as root* — the systemd unit pins the app to run as `azureuser`; only `nginx`'s own startup (binding to port 80) needs root, which is normal and handled entirely by the nginx package itself, not your app.

Nothing below touches files in the git repo — `.env` is already git-ignored, and the rest are new files outside the repo (`/etc/nginx/...`, `/etc/systemd/...`).

---

## 1. Reverse proxy (nginx) — makes port 80 reach the app

### 1.1 Install nginx
- **Where:** VM
- **Run:**
  ```bash
  sudo apt-get update
  sudo apt-get install -y nginx
  ```
- **Why:** `nginx` will be the only thing listening on port 80; it forwards traffic to the app running privately on port 8000.
- **Check:** `nginx -v` prints a version. `systemctl is-active nginx` prints `active` (the package starts it automatically on install).

**Result (2026-10-01):** ran via `ssh -i ~/.ssh/isba4775_azure azureuser@9.205.26.169`. `sudo apt-get update && sudo apt-get install -y nginx` completed, installed `nginx 1.24.0-2ubuntu7.18`. `nginx -v` → `nginx version: nginx/1.24.0 (Ubuntu)`; `systemctl is-active nginx` → `active`. (apt also flagged an unrelated pending kernel upgrade, 6.17→7.0.0-1014-azure — not acted on, out of scope for this task.)

### 1.2 Point nginx at the app instead of its default page
- **Where:** VM
- **Run:**
  ```bash
  sudo tee /etc/nginx/sites-available/career-platform > /dev/null <<'EOF'
  server {
      listen 80;
      server_name _;

      location / {
          proxy_pass http://127.0.0.1:8000;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }
  EOF
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo ln -sf /etc/nginx/sites-available/career-platform /etc/nginx/sites-enabled/career-platform
  sudo nginx -t
  sudo systemctl reload nginx
  ```
- **Why:** `proxy_pass` is the actual forwarding rule — every request to port 80 gets relayed to the app on `127.0.0.1:8000`. Removing the default site stops nginx from serving its "Welcome to nginx" placeholder instead of your app. `nginx -t` checks the config file for typos before reloading, so a mistake doesn't take nginx down.
- **Check:** `sudo nginx -t` prints `syntax is ok` / `test is successful`.
- **Undo:** `sudo rm /etc/nginx/sites-enabled/career-platform && sudo systemctl reload nginx` (nginx then serves nothing on `/`, but keeps running).

**Result (2026-10-01):** wrote `/etc/nginx/sites-available/career-platform`, removed the default site symlink, linked the new site into `sites-enabled`. `sudo nginx -t` → `syntax is ok` / `test is successful`. `sudo systemctl reload nginx` ran with no errors.

### 1.3 Make nginx restart itself if it ever crashes
- **Where:** VM
- **Run:**
  ```bash
  sudo mkdir -p /etc/systemd/system/nginx.service.d
  sudo tee /etc/systemd/system/nginx.service.d/override.conf > /dev/null <<'EOF'
  [Service]
  Restart=on-failure
  RestartSec=3
  EOF
  sudo systemctl daemon-reload
  sudo systemctl restart nginx
  ```
- **Why:** Ubuntu's nginx package does not auto-restart on crash by default. Since nginx is the front door for the whole site, it needs the same self-healing behavior as the app.
- **Check:** `systemctl show nginx -p Restart` prints `Restart=on-failure`.
- **Undo:** `sudo rm /etc/systemd/system/nginx.service.d/override.conf && sudo systemctl daemon-reload && sudo systemctl restart nginx`.

**Result (2026-10-01):** wrote `/etc/systemd/system/nginx.service.d/override.conf`, ran `daemon-reload` and `restart nginx`. `systemctl show nginx -p Restart` → `Restart=on-failure`. Post-restart check: `systemctl is-active nginx` → `active`; `sudo ss -tlnp` shows nginx's 3 worker/master PIDs listening on `0.0.0.0:80`.

---

## 2. App service (systemd) — starts, restarts, runs as azureuser

### 2.1 Update the app's public URL now that there's no port
- **Where:** VM
- **Run:**
  ```bash
  sed -i 's#^SITE_URL=.*#SITE_URL=http://9.205.26.169#' /home/azureuser/career-platform/.env
  grep SITE_URL /home/azureuser/career-platform/.env
  ```
- **Why:** the app uses `SITE_URL` to build links; it should match what visitors actually type (`http://9.205.26.169`), not the internal `:8000` address.
- **Check:** output shows `SITE_URL=http://9.205.26.169`.
- **Undo:** `sed -i 's#^SITE_URL=.*#SITE_URL=http://9.205.26.169:8000#' /home/azureuser/career-platform/.env`.

**Result (2026-10-01):** ran via SSH. `grep SITE_URL .env` → `SITE_URL=http://9.205.26.169`.

### 2.2 Write the systemd unit for the app
- **Where:** VM
- **Run:**
  ```bash
  sudo tee /etc/systemd/system/career-platform.service > /dev/null <<'EOF'
  [Unit]
  Description=Career Platform FastAPI app
  After=network.target
  StartLimitIntervalSec=0

  [Service]
  Type=simple
  User=azureuser
  Group=azureuser
  WorkingDirectory=/home/azureuser/career-platform
  EnvironmentFile=/home/azureuser/career-platform/.env
  ExecStart=/home/azureuser/.local/bin/uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
  Restart=on-failure
  RestartSec=3

  [Install]
  WantedBy=multi-user.target
  EOF
  sudo systemctl daemon-reload
  ```
- **Why:** `User=azureuser` is what keeps the app off root. `--host 127.0.0.1` means the app is only reachable from inside the VM — even if port 8000 were ever opened in the NSG by mistake, the app still wouldn't answer external traffic directly. `Restart=on-failure` + `RestartSec=3` is the "comes back after a crash" behavior; `StartLimitIntervalSec=0` stops systemd from giving up if it crashes several times in a row.
- **Check:** `systemctl cat career-platform` prints the file back with no errors.
- **Undo:** `sudo rm /etc/systemd/system/career-platform.service && sudo systemctl daemon-reload`.

**Result (2026-10-01):** wrote `/etc/systemd/system/career-platform.service`, ran `daemon-reload`. `systemctl cat career-platform` printed the unit back exactly as written, no errors.

### 2.3 Enable and start the app service
- **Where:** VM
- **Run:**
  ```bash
  sudo systemctl enable --now career-platform
  ```
- **Why:** `enable` registers it to start automatically on every future boot; `--now` also starts it immediately so you can verify today.
- **Check:** `systemctl status career-platform` shows `active (running)` and `enabled`.
- **Undo:** `sudo systemctl disable --now career-platform`.

**Result (2026-10-01):** `sudo systemctl enable --now career-platform` created the boot symlink and started it. `systemctl status` → `Loaded: ... enabled; preset: enabled`, `Active: active (running)`. `sudo ss -tlnp` confirms uvicorn listening on `127.0.0.1:8000` only (not `0.0.0.0`). `curl http://127.0.0.1:8000/api/health` from the VM → `{"status":"ok","database":"up","publicSource":"database"}`. `journalctl -u career-platform` shows a clean startup: server process started, application startup complete, `Uvicorn running on http://127.0.0.1:8000`.

---

## 3. Verify

### 3.1 Site answers with no port number
- **Where:** laptop
- **Run:** `curl -sS http://9.205.26.169/api/health`
- **Why:** this is the exact URL a visitor would use — proves nginx is forwarding to the app correctly end to end.
- **Check:** JSON response with `"status":"ok"`.

**Result (2026-10-01):** `curl -sS http://9.205.26.169/api/health` from the laptop → `{"status":"ok","database":"up","publicSource":"database"}`. Confirms nginx on port 80 is forwarding to the app and the app is reading the database.

### 3.2 Port 8000 is not reachable from outside
- **Where:** laptop
- **Run:** `curl -sS --max-time 5 http://9.205.26.169:8000/api/health`
- **Why:** confirms the thing you explicitly asked to keep closed is actually closed — belt-and-suspenders check, since the NSG already has no rule for 8000 and the app itself only listens on `127.0.0.1`.
- **Check:** the command times out / fails to connect (no response at all — that's the expected, correct result here).

**Result (2026-10-01):** `curl -sS --max-time 5 http://9.205.26.169:8000/api/health` from the laptop → `curl: (28) Connection timed out after 5004 milliseconds`, no response. Confirms port 8000 is not reachable from outside the VM.

### 3.3 Both services will survive a reboot
- **Where:** VM
- **Run:** `systemctl is-enabled nginx career-platform`
- **Why:** confirms boot persistence without actually rebooting the VM to test it.
- **Check:** prints `enabled` twice (one line per service).

**Result (2026-10-01):** `systemctl is-enabled nginx career-platform` → `enabled` / `enabled`. Both services are registered to start automatically on boot.

---

Not covered here, by your request: actually killing the app or nginx to watch them restart, and rebooting the VM to confirm boot behavior — you said you'd run those yourself.
