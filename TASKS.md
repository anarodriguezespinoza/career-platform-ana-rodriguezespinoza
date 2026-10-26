# Project 1 gaps

Due Thursday, October 22, 2026, 1:45 PM. Gaps found by auditing the repository against the Project 1 requirements on 2026-10-20. Each line names the file or check that closes it.

## 1. Profile and project data

- [x] DB failure keeps the profile visible, shows "Projects temporarily unavailable," and returns 503 → `app/main.py`, `app/routes/public.py`, `app/templates/public/home.html`, `projects.html`; test in `tests/test_public_routes.py`
- [x] Empty projects table shows a deliberate empty-state message → `app/templates/public/projects.html` + test in `tests/test_public_routes.py`
- [x] No hard-coded profile text when the profile row is missing → `app/templates/public/home.html`
- [x] Recovery without restart is tested (fail DB, then restore, then refresh returns 200 with projects) → `tests/test_public_routes.py`
- [x] Seed doesn't invent experience: label or remove the "Software Engineer at Career Platform, 2024" entry → `app/seed.py`
- [x] A real project entry exists in the live database (e.g. "This website, in progress," labeled) → check: `/projects` on the live site
- [x] Profile shows education and professional links → check: live home and about pages
- [x] The initial choice of database engine (SQLite) is written down with the reason → README decisions section

## 2. Azure deployment

- [x] App runs with multiple workers → `--workers` in `/etc/systemd/system/career-platform.service`; record in `docs/superpowers/plans/2026-10-01-operate-the-vm.md`
- [x] Controlled VM restart verified (site and DB return after the reboot) → dated result in `docs/superpowers/plans/2026-10-01-operate-the-vm.md`
- [x] Explain which configuration made the restart work (systemd enable, nginx, .env) → README or the operate-the-vm plan
- [x] Document the VM's private IP along with SSH access and network rules → `docs/evidence/ex03.md` or README
- [x] Page-level check that the Azure site read its database, beyond `/api/health` → dated evidence or marked unverified
- [x] Azure VM is still running as required → check: `az vm show -d -g rg-career-platform -n vm-career-platform --query powerState`

## 3. Domain and HTTPS

- [x] `www` is a proxied record with a Cloudflare redirect rule to the root (it currently points to the Azure IP, DNS only) → Cloudflare; record in a DNS evidence file
- [x] `http://www` and `https://www` both land on the root with a valid certificate → `curl -I` results in `docs/evidence/`
- [x] Railway HTTPS verified: certificate hostname, validity, renewal arrangement → `openssl s_client` output in `docs/evidence/`
- [x] Final DNS records table with each record's purpose and its verification result → `docs/evidence/` (new dump after the Zoho and `www` changes)

## 4. Railway and PostgreSQL migration

- [x] Fill in Result lines for Tasks 1–6 → `docs/superpowers/plans/2026-10-08-railway-postgres-migration.md`
- [x] Make one real change to the original data before the copy, so a re-seed can't pass as the transferred database → recorded in the migration plan *(the copy had already run on 2026-10-08, so this is met differently: the 6 original inquiries, which the seed can't create, match row for row; see the plan's reconciliation note 3 and `docs/evidence/migration-comparison.md`)*
- [x] Compare source and target records: row counts, content, rendered page → `docs/evidence/` comparison
- [x] Cutover log and post-cutover checks → migration plan Task 6 results
- [x] Rollback procedure that accounts for writes after cutover (contact inquiries) → README rollback section
- [x] Responsibilities comparison, Azure vs Railway (OS, runtime, entry point, TLS, code, config, DB software, data, DNS) → README
- [x] Reconcile the plan with the requirements: the custom domain is listed as "Out of scope," and step 6.5 deallocates the VM → note in the migration plan

## 5. Reviewed change through Railway

- [x] One reviewed change linked to its commit SHA, its Railway deployment ID, and the behavior observed at the domain → `docs/evidence/` and the submission index
- [x] Record the diff review and the local check done before the push → same evidence file
- [x] Restore a previous working version, for code and for database changes → README rollback section

## 6. Zoho email

- [x] Header analysis → `docs/evidence/zoho-header-check.md`
- [x] Before-MX message and what happened to it → one line in `docs/evidence/ex06.md`
- [x] Explain MX, SPF, DKIM, and DMARC → `docs/evidence/ex06.md` or README
- [x] DNS dump after the mail records were added → `docs/evidence/`
- [x] The reply shows the custom address as the sender → `docs/evidence/ex06.md`
- [x] Decide whether to redact the personal Gmail address → `docs/evidence/ex06.md`

## 7. Google Analytics

- [x] Record the action performed, the event observed, why it's useful, and the date → `docs/evidence/ex06.md` §3
- [x] Explain the browser → GA collection path, including the consent gate → `docs/evidence/ex06.md` or README

## 8. Engineering record

- [x] Submission index with repository URL, live URL, final SHA, and links for items 1–8 → `docs/project-1-submission.md`
- [x] README links the spec, plans, ex03, ex05, ex06, zoho-header-check, `how-this-site-is-secured.md`, and the submission index → `README.md`
- [x] Azure and Railway architecture diagrams with locations, protocols, ports, data flow, and the email and analytics paths (current diagrams show AWS) → `docs/diagrams/`
- [x] README rollback section (code and data) → `README.md`
- [x] README migration section: how current data was preserved and which responsibilities moved → `README.md`
- [x] README decisions: Railway migration, managed vs self-hosted email, plus alternatives and reasons → `README.md`
- [x] README investigated failures: link ex03 (expand symptom → checks → diagnosis → repair → re-check) and ex05 (label it a simulated lab failure) → `README.md`, `docs/evidence/ex03.md`
- [x] README remaining limitations → `README.md`
- [ ] README reflection → `README.md`
- [ ] README costs, credits, expiry dates (including the Railway trial end date), and cleanup plan → `README.md`
