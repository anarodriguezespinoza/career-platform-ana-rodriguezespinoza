# How do I know my data to your site is encrypted?

This page documents how HTTPS is set up for `anarodriguezespinoza.com`, running on
`vm-career-platform` in Azure, and what was actually verified (not just configured)
on 2026-10-06.

## 1. Certificate: who issued it, what it covers, when it expires

Checked on the VM with `sudo certbot certificates`:

| Field | Value |
|---|---|
| Certificate name | `anarodriguezespinoza.com` |
| Issuer | Let's Encrypt |
| Domains covered | `anarodriguezespinoza.com`, `www.anarodriguezespinoza.com` |
| Key type | ECDSA |
| Expiry | 2027-01-04 21:03:44 UTC (89 days from the check date) |
| Certificate path | `/etc/letsencrypt/live/anarodriguezespinoza.com/fullchain.pem` |

The certificate only covers the two domains listed above — it is not a wildcard and
does not cover any other subdomain.

## 2. Renewal: how it works, and what the test showed

Let's Encrypt certificates are short-lived (90 days), so renewal has to happen
automatically. On this VM that's handled by a systemd timer that certbot's Ubuntu
package installs and enables by default:

- **Timer:** `certbot.timer`, runs **twice a day**.
- **Checked with:** `systemctl status certbot.timer` → `active (waiting)`, enabled.
- **Checked with:** `systemctl list-timers certbot.timer` → next trigger was
  2026-10-07 03:56 UTC, about 2 hours after this check.

Certbot only actually renews a certificate when it's within 30 days of expiring;
otherwise each timer firing is a no-op. To confirm the renewal *mechanism itself*
works — not just that the timer is scheduled — I ran a dry run, which goes through
the full renewal process (including re-proving domain ownership to Let's Encrypt)
without installing a new certificate:

```bash
sudo certbot renew --dry-run
```

**Result (2026-10-06, verified):**

```
Saving debug log to /var/log/letsencrypt/letsencrypt.log

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Processing /etc/letsencrypt/renewal/anarodriguezespinoza.com.conf
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Simulating renewal of an existing certificate for anarodriguezespinoza.com and www.anarodriguezespinoza.com

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Congratulations, all simulated renewals succeeded:
  /etc/letsencrypt/live/anarodriguezespinoza.com/fullchain.pem (success)
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
```

This confirms the VM can still complete the domain-ownership challenge and would
successfully renew the real certificate when it gets within 30 days of expiring —
the timer firing twice a day is not just scheduled, it would actually succeed if it
ran today.

## 3. Open ports: which ones, why, and who can reach SSH

Checked with `az network nsg rule list` against the VM's network security group
(`vm-career-platform-nsg`):

| Port | Rule name | Source allowed | Why it's open |
|---|---|---|---|
| 22 (SSH) | `Allow-SSH-Laptop` | **One specific IP only** (my current laptop's public IP) | Lets me administer the VM remotely. Locked to one IP so no one else on the internet can even attempt to log in. |
| 80 (HTTP) | `Allow-HTTP-80` | Anywhere | Must stay open so browsers that type `http://` (or follow an old link) can reach the site — nginx immediately redirects every one of these requests to HTTPS (301 to `https://...`), it never serves content over plain HTTP. |
| 443 (HTTPS) | `Allow-HTTPS-443` | Anywhere | This is the actual encrypted connection customers use. |

Port 8000, where the app itself listens, has **no rule at all** — it's not reachable
from the internet. Re-verified on 2026-10-06:

```bash
curl -sS --max-time 5 http://9.205.26.169:8000/api/health
# curl: (28) Connection timed out after 5005 milliseconds
```

Only connections from my current whitelisted IP can reach port 22 at all; anyone
else's SSH attempt is silently dropped (no response, no rejection — it just times
out), the same behavior documented in `ex03.md` for the coffee-shop scenario.

## 4. Where encryption starts and ends

```
Browser  ──HTTPS (encrypted)──▶  nginx on the VM (port 443)
                                        │
                                        │  plain HTTP, NOT encrypted
                                        ▼
                                 app on 127.0.0.1:8000 (uvicorn)
```

- **Encrypted segment:** everything between the customer's browser and nginx. This
  is the only part of the trip that crosses the public internet, and it's the part
  Let's Encrypt's certificate protects.
- **Unencrypted segment:** nginx's connection to the app, `http://127.0.0.1:8000`,
  is plain HTTP — confirmed from the live nginx config (`proxy_pass
  http://127.0.0.1:8000;`). This is fine because `127.0.0.1` means "only this same
  VM can talk to this address" — the app's socket never reaches the network card,
  so this hop can't be intercepted by anything outside the VM. Verified with `sudo
  ss -tlnp` on the VM: uvicorn is listed as listening on `127.0.0.1:8000` only, not
  `0.0.0.0:8000`.

So: nginx is the encryption boundary. It terminates TLS (decrypts what the customer
sent), then talks to the app over a connection that never leaves the machine.

## 5. How a customer can check this themselves (Chrome)

1. Go to `https://anarodriguezespinoza.com`.
2. Click the icon immediately to the left of the domain name in the address bar.
3. Click **"Connection is secure."**
4. Click **"Certificate is valid."** Chrome will show the certificate, including
   that it was issued by Let's Encrypt and the dates it's valid between.

## 6. Raw openssl output

Run from my laptop, against the live site, on 2026-10-06:

```bash
echo | openssl s_client -connect anarodriguezespinoza.com:443 -servername anarodriguezespinoza.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

```
subject=CN=anarodriguezespinoza.com
issuer=C=US, O=Let's Encrypt, CN=YE2
notBefore=Oct  6 21:03:45 2026 GMT
notAfter=Jan  4 21:03:44 2027 GMT
```

This matches what `certbot certificates` reported on the VM (section 1), confirming
the certificate the server is actually presenting to visitors is the one Let's
Encrypt issued — not a stale or mismatched file.

## What's not covered here

I did not test a real (non-dry-run) renewal, since that would be redundant with the
dry run and risks hitting Let's Encrypt's rate limits for no benefit — the dry run
exercises the same renewal code path without installing a new cert. I also did not
test what happens if the certbot timer is disabled or the VM is offline when a
renewal is due; if the cert were ever found expired, the first things to check
would be `systemctl status certbot.timer` (is it still enabled and firing) and
`sudo certbot renew --dry-run` again (does the domain-ownership challenge still
succeed — e.g., check that port 80 is still open and nginx's HTTP block still
answers, since certbot's default challenge method needs that).

No private keys, certificate files, or credentials are included in this document or
committed to the repository — only certificate metadata (subject, issuer, validity
dates) and configuration that is not secret.
