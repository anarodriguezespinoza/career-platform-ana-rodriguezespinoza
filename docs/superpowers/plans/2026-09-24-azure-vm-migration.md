# Azure VM Migration Plan

**Goal:** Move the career-platform FastAPI app from the laptop to the existing Azure VM (`vm-career-platform`, resource group `rg-career-platform`), running against the laptop's own SQLite data, verify it serves that data, then deallocate the VM to stop billing.

**Scope:** A one-time manual verification deployment (foreground/background `uvicorn`, no reverse proxy, no systemd unit, no TLS). Not a hardened production setup — the goal is "prove it runs on the VM with my data," then shut the VM down.

**Target:**
- VM: `vm-career-platform` (resource group `rg-career-platform`), public IP `<VM_PUBLIC_IP>`
- SSH: `ssh -i ~/.ssh/<azure_vm_key> azureuser@<VM_PUBLIC_IP>`
- Repo: `https://github.com/anarodriguezespinoza/career-platform-ana-rodriguezespinoza.git`
- Branch: `python-fastapi` — the FastAPI/Jinja conversion is **not yet on `main`**; cloning `main` alone would get the old app. Confirm which branch you actually want deployed before Task 3.
- App entrypoint: `uvicorn app.main:app`, health check at `GET /api/health`
- Lock file: `uv.lock` is committed (`fb852b2 Add uv.lock for reproducible dependency resolution`) and already pushed to `origin/python-fastapi`, so `uv sync` has something to sync from as soon as the VM clones the repo.

---

## 1. Server

### 1.1 Confirm the VM is running and reachable
- **Where:** laptop
- **Run:**
  ```bash
  az vm show -d -g rg-career-platform -n vm-career-platform --query "powerState" -o tsv
  ```
  If it reports `VM deallocated`, start it:
  ```bash
  az vm start -g rg-career-platform -n vm-career-platform
  ```
- **Why:** every later step depends on the VM being up and on IP `<VM_PUBLIC_IP>` still being assigned (a deallocated/restarted VM can get a new public IP unless it's static — worth checking once here).
- **Check:** `az vm show -d -g rg-career-platform -n vm-career-platform --query "publicIps" -o tsv` returns `<VM_PUBLIC_IP>`.
- **Undo:** if you only started it to run this check and want to stop immediately, `az vm deallocate -g rg-career-platform -n vm-career-platform` (same command used in the Shutdown section).

**Result (2026-09-30):** already running — `az vm show -d ... --query "{power,ip}"` returned `power: "VM running"`, `ip: "<VM_PUBLIC_IP>"`. No start needed.

### 1.2 Open an SSH session
- **Where:** laptop → VM
- **Run:**
  ```bash
  ssh -i ~/.ssh/<azure_vm_key> azureuser@<VM_PUBLIC_IP>
  ```
- **Why:** everything under Packages, Code, Python, Config, and Processes runs on the VM over this session.
- **Check:** the shell prompt changes to something like `azureuser@vm-career-platform:~$`; `hostname` confirms it.
- **Undo:** `exit` — closing an SSH session changes nothing on the VM.

**Result (2026-09-30):** `ssh -i ~/.ssh/<azure_vm_key> azureuser@<VM_PUBLIC_IP> "hostname && whoami"` returned `vm-career-platform` / `azureuser`. Key-based auth works, no host-key prompt issues.

---

## 2. Packages

### 2.1 Refresh the package index
- **Where:** VM
- **Run:** `sudo apt-get update`
- **Why:** avoids installing stale/missing package versions for git and sqlite3.
- **Check:** command exits 0; output ends with `Reading package lists... Done`.
- **Undo:** none needed — this only refreshes local metadata, no installed state changes.

**Result (2026-09-30):** ran clean, fetched 37.4 MB, ended `Reading package lists...`. No errors.

### 2.2 Install git and sqlite3
- **Where:** VM
- **Run:** `sudo apt-get install -y git sqlite3`
- **Why:** `git` is needed to clone the repo; `sqlite3` gives a CLI to sanity-check the `.db` file after it's copied over.
- **Check:** `git --version && sqlite3 --version` both print version strings.
- **Undo:** `sudo apt-get remove -y git sqlite3` (add `--purge` to also drop config files). Skip this if the VM will be reused later — reinstalling is cheap either way.

**Result (2026-09-30):** `git` was already present on the base image (`git version 2.43.0`, not newly installed — apt only pulled in `sqlite3`/`libsqlite3-0`). `sqlite3 --version` → `3.45.1`. Both commands confirmed working.

---

## 3. Code

### 3.1 Clone the repository
- **Where:** VM
- **Run:**
  ```bash
  git clone https://github.com/anarodriguezespinoza/career-platform-ana-rodriguezespinoza.git ~/career-platform
  cd ~/career-platform
  git checkout python-fastapi
  ```
- **Why:** pulls the app code onto the VM; the FastAPI version only exists on the `python-fastapi` branch (confirmed via `git merge-base` — `main` does not yet include the Next.js→FastAPI conversion).
- **Check:** `git log --oneline -1` on the VM shows the same commit hash as `git log --oneline -1 python-fastapi` on the laptop.
- **Undo:** `rm -rf ~/career-platform` — nothing outside that directory is touched by a plain clone.

**Result (2026-09-30):** cloned to `/home/azureuser/career-platform`, checked out `python-fastapi`. VM `git log --oneline -1` → `fb852b2 Add uv.lock for reproducible dependency resolution`, matching the laptop exactly. `git status -sb` shows clean, tracking `origin/python-fastapi`.

---

## 4. Python

### 4.1 Install uv on the VM
- **Where:** VM
- **Run:** `curl -LsSf https://astral.sh/uv/install.sh | sh` then `source $HOME/.local/bin/env` (or open a new shell)
- **Why:** `uv` isn't part of the base Ubuntu image; this is the standard installer, matching how the project expects dependencies to be managed.
- **Check:** `uv --version` prints a version.
- **Undo:** `rm -rf ~/.local/bin/uv ~/.local/bin/uvx ~/.cargo/bin/uv` (exact paths depend on installer output — it prints where it placed the binaries) or `rm -rf ~/.local/share/uv` for cached data.

**Result (2026-09-30):** installed uv 0.12.21 to `/home/azureuser/.local/bin`. `uv --version` (after sourcing `$HOME/.local/bin/env`) → `uv 0.12.21 (x86_64-unknown-linux-gnu)`.

### 4.2 Sync dependencies from the lock file
- **Where:** VM
- **Run:**
  ```bash
  cd ~/career-platform
  uv sync --locked
  ```
  (`--locked` makes `uv` fail loudly instead of silently re-resolving if the lock file is missing or out of date — worth keeping for a reproducibility check.)
- **Why:** installs the exact dependency versions from `pyproject.toml`/`uv.lock` into a project-local virtual environment (`.venv`), rather than whatever versions happen to resolve at install time.
- **Check:** `uv run python -c "import fastapi, uvicorn, sqlalchemy; print('ok')"` prints `ok`.
- **Undo:** `rm -rf .venv` removes the synced environment; the source tree and lock file are untouched.

**Result (2026-09-30):** `uv sync --locked` resolved 64 packages against the committed lock file with no re-resolution (would have errored under `--locked` if the lock were stale), installed 47 into `.venv` using the system CPython 3.12.3 interpreter — includes `fastapi==0.142.2`, `uvicorn==0.54.0`, `sqlalchemy==2.1.1`. Import check `uv run python -c "import fastapi, uvicorn, sqlalchemy; print('ok')"` → `ok`.

---

## 5. Config

### 5.1 Copy `.env.example` to `.env`
- **Where:** VM
- **Run:**
  ```bash
  cd ~/career-platform
  cp .env.example .env
  ```
- **Why:** the app reads configuration from `.env` (`DATABASE_URL`, Cognito/SES/S3 variables); `.env.example` is the template checked into git.
- **Check:** `cat .env` shows the same keys as `.env.example`.
- **Undo:** `rm .env` — it's git-ignored and never committed, so removing it just reverts to the freshly-cloned state.

**Result (2026-09-30):** copied; `.env` shows the same 14 keys as `.env.example` (APP_ENV, SITE_URL, DATABASE_URL, COGNITO_*, S3_*, SES_*, E2E_*), all blank except the three defaults.

### 5.2 Fill in `.env` for this VM
- **Where:** VM
- **Run:** edit `.env` (e.g. `nano .env`) and set at minimum:
  ```
  APP_ENV=development
  SITE_URL=http://<VM_PUBLIC_IP>:8000
  DATABASE_URL=sqlite:///./data.db
  ```
  (name the file `data.db` — or whatever you'll `scp` in as — rather than reusing `dev.db`, so there's no ambiguity about which file the app is reading). Leave Cognito/S3/SES blank unless you want sign-in/contact-form features to work; the plan below only needs the public pages and `/api/health` to prove out.
- **Why:** points the app at the SQLite file that's about to be copied over, and sets `SITE_URL` so generated links/cookies match the VM's address instead of `localhost`.
- **Check:** `grep DATABASE_URL .env` shows the path you intend to use in step 6.
- **Undo:** restore from `.env.example` again (step 5.1), or `git checkout -- .env` has no effect since `.env` isn't tracked — just re-copy the template.

**Result (2026-09-30):** set `SITE_URL=http://<VM_PUBLIC_IP>:8000` and `DATABASE_URL=sqlite:///./data.db` via `sed`. `APP_ENV=development` left as-is. Cognito/S3/SES left blank per the plan's scope (public pages + `/api/health` only).

---

## 6. Data

### 6.1 Copy the SQLite database from the laptop to the VM
- **Where:** laptop → VM (run **from the laptop**, not over the existing SSH session)
- **Run:**
  ```bash
  scp -i ~/.ssh/<azure_vm_key> ./dev.db azureuser@<VM_PUBLIC_IP>:~/career-platform/data.db
  ```
  (adjust `./dev.db` to wherever your working `.db` file actually is, and match the filename to whatever you set `DATABASE_URL` to in 5.2).
- **Why:** the whole point of the migration is to serve *your* existing data, not a freshly seeded/empty database.
- **Check:** back on the VM, `ls -la ~/career-platform/data.db` shows a non-zero size matching the laptop's `ls -la dev.db`; `sqlite3 ~/career-platform/data.db ".tables"` lists the expected app tables.
- **Undo:** `rm ~/career-platform/data.db` on the VM. The laptop's original file is untouched by `scp` (it only reads the source).

**Result (2026-09-30):** copied `./dev.db` (114688 bytes, laptop) → `~/career-platform/data.db` (114688 bytes, VM) — exact size match. `sqlite3 data.db ".tables"` on the VM lists `Profile, Project, ProjectTechnology, Experience, Skill, ResumeSettings, ContactInquiry, _prisma_migrations` — matches the app's expected schema.

---

## 7. Processes

### 7.1 Start uvicorn
- **Where:** VM
- **Run:**
  ```bash
  cd ~/career-platform
  set -a && source .env && set +a
  nohup uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 > uvicorn.log 2>&1 &
  ```
  `nohup … &` keeps the server running after you disconnect the SSH session; drop it and run in the foreground instead if you'd rather watch logs live and stop with Ctrl-C.
- **Why:** starts the app server bound to all interfaces on port 8000 so it's reachable from outside the VM (default `127.0.0.1` binding would only be reachable from inside the VM).
- **Check:** `curl -s localhost:8000/api/health` from the VM itself returns JSON with `"status"` in it; `jobs` or `ps aux | grep uvicorn` shows the process running.
- **Undo:** bring it to the foreground with `fg` then Ctrl-C, or find and kill it: `pkill -f "uvicorn app.main:app"`.

**Result (2026-09-30):** started via `nohup uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 …`. `ss -tlnp` confirmed it listening on `0.0.0.0:8000`. Note: launching this way reliably hangs the SSH invocation itself (the process ends up correctly detached and running — reparented to `init`, confirmed via a separate connection — but the foreground SSH command never returns); cause not root-caused, but reproducible. Later restricted to VM-only access — see 7.3.

### 7.2 Open the port through Azure's network security group
- **Where:** Azure Portal (or `az` CLI on the laptop)
- **Run (portal):** Networking blade for `vm-career-platform` → Add inbound port rule → destination port `8000`, protocol TCP, source = your IP (or `Any` if you don't mind it being open to the internet while testing) → Add.
  **Or (CLI, laptop):**
  ```bash
  az network nsg rule create \
    --resource-group rg-career-platform \
    --nsg-name <nsg-name-from-vm-networking-blade> \
    --name Allow-8000-Verify \
    --priority 1010 \
    --destination-port-ranges 8000 \
    --access Allow --protocol Tcp
  ```
- **Why:** the app answering on `localhost:8000` inside the VM proves nothing about external reachability — Azure's NSG blocks all inbound ports by default except what's explicitly opened (typically just 22 for SSH).
- **Check:** from the laptop, `curl -s http://<VM_PUBLIC_IP>:8000/api/health` returns the same JSON as the VM-local check in 7.1.
- **Undo:** delete the rule — portal: Networking blade → select the rule → Delete; CLI: `az network nsg rule delete --resource-group rg-career-platform --nsg-name <nsg-name> --name Allow-8000-Verify`. Do this as part of Shutdown even if you deallocate the VM, since NSG rules persist independently of VM power state.

**Status (2026-09-30): not performed.** Confirmed via `az network nsg rule list` that the NSG has only one rule, `Allow-SSH-Laptop` (TCP/22) — no port-8000 rule was ever created. A direct external `curl` to port 8000 from the laptop (5s timeout) hung until timeout with no response, consistent with the NSG silently dropping the inbound SYN. Rather than opening this port, access was instead restricted further — see 7.3.

### 7.3 Restrict to VM-only access (ad hoc, taken instead of exposing externally)
- **Where:** VM
- **Run:**
  ```bash
  pkill -f "uvicorn app.main:app"   # stop the 0.0.0.0-bound instance from 7.1
  cd ~/career-platform
  set -a && source .env && set +a
  nohup uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 > uvicorn.log 2>&1 < /dev/null &
  disown
  ```
- **Why:** to verify the app runs correctly without exposing it to the internet at all — binding to `127.0.0.1` makes it reachable only from processes running on the VM itself, regardless of any NSG rule.
- **Check:** `ss -tlnp 'sport = :8000'` shows `127.0.0.1:8000` (not `0.0.0.0:8000`); `curl http://127.0.0.1:8000/api/health` from the VM succeeds.
- **Undo:** stop it (`pkill -f "uvicorn app.main:app"`) and restart per 7.1 if external-facing access is wanted again.

**Result (2026-09-30):** stopping the old instance via `pkill -f "uvicorn app.main:app"` matched and killed its own invoking shell (the pattern matched the command line running the `pkill` itself), so that first attempt exited with SSH error 255; a follow-up connection confirmed the old process was in fact already gone. Restarted bound to `127.0.0.1`; `ss -tlnp` confirmed `LISTEN` on `127.0.0.1:8000` only. `curl http://127.0.0.1:8000/api/health` from inside the VM → `{"status":"ok","database":"up","publicSource":"database"}`, HTTP 200.

---

## 8. Verify

### 8.1 Confirm the site answers and shows your data
- **Where:** laptop
- **Run:**
  ```bash
  curl --fail-with-body -sS http://<VM_PUBLIC_IP>:8000/api/health
  ```
  Then open `http://<VM_PUBLIC_IP>:8000/` in a browser and check a page whose content came from your SQLite data (e.g. the resume/projects page) — not just the health check, since that only proves the process is up.
- **Why:** `/api/health` (per `docs/deployment.md`) returns `{"status":"ok","database":"up",...}` when the app can talk to the database it's pointed at — this is the project's own recovery-verification convention, reused here to confirm the VM's app is actually reading `data.db` rather than failing over to an empty/snapshot state.
- **Check:** health JSON shows `"status":"ok"` and `"database":"up"`; the browser page shows content you recognize from your laptop's data (not placeholder/seed content).
- **Undo:** N/A — this is a read-only check.

**Status (2026-09-30): not run as written, and can't succeed as written yet.** This step requires external reachability, which depends on 7.2 (never performed — no NSG rule for port 8000 exists) and on the app being bound to all interfaces. As of 7.3, uvicorn on the VM is intentionally bound to `127.0.0.1` only, so `curl http://<VM_PUBLIC_IP>:8000/api/health` from the laptop will time out by design, not due to a deployment defect (this was independently confirmed: a direct external curl attempt hung until its timeout, and the NSG rule list has only the SSH rule).

An internal-only substitute was run instead (see 7.3's result): `curl http://127.0.0.1:8000/api/health` from inside the VM returned `{"status":"ok","database":"up","publicSource":"database"}`, confirming the app can reach and query `data.db` successfully. That confirms the *deployment* works; it does not confirm *external* reachability, which this step as literally written requires.

One caveat on what "shows your data" can prove right now: the laptop's own `dev.db` currently has no published profile/project/experience/skill content (only tables, no meaningful rows) — a browser check of the public pages wouldn't show recognizable personal content by itself, regardless of the VM, because the source data doesn't have any yet.

**Open decision for you:** run 7.2 to expose port 8000 externally and re-test this step for real, or accept the internal-only health check above as sufficient verification and move straight to Shutdown.

---

## 9. Shutdown

### 9.1 Stop uvicorn
- **Where:** VM
- **Run:** `pkill -f "uvicorn app.main:app"`
- **Why:** clean shutdown of the app process before powering down the VM, avoiding a mid-request kill.
- **Check:** `ps aux | grep uvicorn` shows no matching process; `curl -s localhost:8000/api/health` fails to connect.
- **Undo:** re-run the `nohup uv run uvicorn …` command from step 7.1.

### 9.2 Close the port you opened in 7.2 (recommended)
- **Where:** Azure Portal or laptop (`az` CLI)
- **Run:** delete the `Allow-8000-Verify` NSG rule (see 7.2 for the exact command/portal path).
- **Why:** NSG rules are billed at $0 but remain a standing exposure — port 8000 stays open to the internet even while the VM is deallocated and restarted later, unless removed.
- **Check:** `az network nsg rule list --resource-group rg-career-platform --nsg-name <nsg-name> -o table` no longer lists `Allow-8000-Verify`.
- **Undo:** re-create it with the command in 7.2.

### 9.3 Deallocate the VM
- **Where:** laptop (`az` CLI) or Azure Portal
- **Run:**
  ```bash
  az vm deallocate -g rg-career-platform -n vm-career-platform
  ```
  (Portal equivalent: VM overview page → Stop. Azure's "Stop" button *is* deallocate, not a lightweight pause — it releases the compute allocation and stops billing for compute, unlike an in-guest `shutdown`.)
- **Why:** this is the actual cost control — a running VM bills for compute whether or not uvicorn is up; only "deallocated" stops that meter. Disk storage still bills while deallocated.
- **Check:** `az vm show -d -g rg-career-platform -n vm-career-platform --query "powerState" -o tsv` reports `VM deallocated`.
- **Undo:** `az vm start -g rg-career-platform -n vm-career-platform` — note the public IP may change on restart unless it was allocated as static; re-check with `az vm show -d ... --query publicIps` before reconnecting.

---

## Verify: expected vs. actual

| Check | Expected | Actual | Match? |
|---|---|---|---|
| `data.db` on VM vs. laptop's DB | Same file, same content | Byte-identical file size, matching schema (`sqlite3 .tables` output identical) | ✅ |
| `GET /api/health` from inside the VM | `{"status":"ok","database":"up",...}` | `{"status":"ok","database":"up","publicSource":"database"}` — confirms the app can query `data.db` | ✅ |
| `GET /api/health` from the laptop (external) | Same JSON as above | Not run — no NSG rule permits inbound port 8000, and uvicorn is currently bound to `127.0.0.1` only (7.3) | ⬜ pending a decision on 7.2 |
| Public pages show recognizable personal content | Content you recognize from your data | Not meaningfully checkable right now — the source `dev.db` has no published profile/project/experience/skill rows yet | ⚠️ not a deployment defect; the source data is simply empty |
