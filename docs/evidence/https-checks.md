# HTTPS and redirect checks

**Captured:** 2026-10-21 18:45 PDT (2026-10-22 01:45 UTC), from my laptop, right after the `www` record was switched to proxied (see [dns-records-final.md](dns-records-final.md)).

## Results

| Check | Expected | Observed | Result |
| --- | --- | --- | --- |
| `http://www.anarodriguezespinoza.com/` | 301 to `https://anarodriguezespinoza.com/` | `301`, `Location: https://anarodriguezespinoza.com/`, `Server: cloudflare` | Pass |
| `https://www.anarodriguezespinoza.com/` | valid certificate, then 301 to the root | `301` to the root; Cloudflare edge certificate `*.anarodriguezespinoza.com` (Let's Encrypt `YE1`), verify result `0` | Pass |
| `https://www.anarodriguezespinoza.com/projects?x=1` | path and query kept | `301` to `https://anarodriguezespinoza.com/projects?x=1` | Pass |
| `http://anarodriguezespinoza.com/` | 301 to https | `301` to `https://anarodriguezespinoza.com/` (Railway edge) | Pass |
| Railway certificate hostname | covers `anarodriguezespinoza.com` | SAN `DNS:anarodriguezespinoza.com` | Pass |
| Railway certificate validity | chain verifies, in date | Let's Encrypt `YE2` → `Root YE` → `ISRG Root X2`, `Verify return code: 0 (ok)`, valid 2026-10-08 21:23 UTC to 2027-01-06 21:23 UTC, TLS 1.3 | Pass |
| `https://anarodriguezespinoza.com/` page | `200` | **`502`** from `server: railway-hikari` ("Application failed to respond") | **Fail**: TLS works, the app behind Railway's edge didn't answer. Cause: a Railway platform outage with a security notice on 2026-10-21 (Builds and API down). See README → Investigated failures. Re-run after recovery |

Before this change (same day, 18:21 PDT), `www` was DNS only, so `https://www…/` went straight to the Azure VM and returned `200` from Nginx with the VM's own certificate (SAN `anarodriguezespinoza.com, www.anarodriguezespinoza.com`). That meant `www` showed the old Azure copy of the site instead of the root.

## After the Railway recovery (2026-10-25 22:20 PDT)

Re-run after the password rotation, the `PORT=8000` fix, and deployment `11a6840a`:

```text
captured 2026-10-26T05:20:54Z
http://www.anarodriguezespinoza.com/ code=301 redirect=https://anarodriguezespinoza.com/ ssl_verify=0
https://www.anarodriguezespinoza.com/ code=301 redirect=https://anarodriguezespinoza.com/ ssl_verify=0
http://anarodriguezespinoza.com/ code=301 redirect=https://anarodriguezespinoza.com/ ssl_verify=0
https://anarodriguezespinoza.com/ code=200 redirect= ssl_verify=0
{"status":"ok","database":"up","publicSource":"database"}
issuer=C=US, O=Let's Encrypt, CN=YE2 notBefore=Oct  8 21:23:52 2026 GMT notAfter=Jan  6 21:23:51 2027 GMT  DNS:anarodriguezespinoza.com
```

Every row in the results table now passes, including the root page (`200`).

## Renewal arrangement

- **Root domain (Railway):** Railway requests and renews the Let's Encrypt certificate for a verified custom domain itself. Nothing on my side runs certbot. Renewal depends on two things staying true: the `CNAME @ → jf53ce39.up.railway.app` record stays **DNS only** (Railway must answer the ACME challenge itself), and the `_railway-verify` TXT stays in place. The current certificate expires 2027-01-06. Let's Encrypt certificates last 90 days and are normally renewed around 30 days before expiry, so a certificate still showing `notAfter=Jan 6 2027` after mid-December would mean renewal is stuck.
- **`www` (Cloudflare):** Cloudflare Universal SSL issues and renews the edge certificate (`*.anarodriguezespinoza.com`) automatically while the record is proxied.
- **Azure VM (no longer in the request path):** certbot's systemd timer still renews the VM's certificate. See [encryption.md](encryption.md).

`openssl s_client -servername wrong.example` against the same IP returns `CN=*.up.railway.app`. This shows that Railway's edge picks the certificate by SNI: our certificate is served only because we ask for our hostname.

## Raw output

```text
captured 2026-10-22T01:45:50Z
$ curl -sSI http://www.anarodriguezespinoza.com/
HTTP/1.1 301 Moved Permanently
Date: Thu, 22 Oct 2026 01:45:50 GMT
Location: https://anarodriguezespinoza.com/
Server: cloudflare

$ curl -sSI https://www.anarodriguezespinoza.com/
HTTP/2 301 
date: Thu, 22 Oct 2026 01:45:50 GMT
location: https://anarodriguezespinoza.com/
server: cloudflare

$ curl -sSI http://anarodriguezespinoza.com/
HTTP/1.1 301 Moved Permanently
location: https://anarodriguezespinoza.com/
Date: Thu, 22 Oct 2026 01:45:51 GMT

$ curl -sSI https://anarodriguezespinoza.com/
HTTP/2 502 
server: railway-hikari
date: Thu, 22 Oct 2026 01:45:51 GMT

$ echo | openssl s_client -connect anarodriguezespinoza.com:443 -servername anarodriguezespinoza.com -verify_return_error 2>&1 | grep -E 'depth|Verify return|Protocol'
depth=3 C=US, O=Internet Security Research Group, CN=ISRG Root X2
depth=2 C=US, O=ISRG, CN=Root YE
depth=1 C=US, O=Let's Encrypt, CN=YE2
depth=0 CN=anarodriguezespinoza.com
Protocol: TLSv1.3
Verify return code: 0 (ok)

$ echo | openssl s_client -connect anarodriguezespinoza.com:443 -servername anarodriguezespinoza.com 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
subject=CN=anarodriguezespinoza.com
issuer=C=US, O=Let's Encrypt, CN=YE2
notBefore=Oct  8 21:23:52 2026 GMT
notAfter=Jan  6 21:23:51 2027 GMT
X509v3 Subject Alternative Name: 
    DNS:anarodriguezespinoza.com

$ echo | openssl s_client -connect anarodriguezespinoza.com:443 -servername wrong.example 2>/dev/null | openssl x509 -noout -subject
subject=CN=*.up.railway.app

$ curl -sS https://jf53ce39.up.railway.app/api/health
{"status":"error","code":404,"message":"Application not found","request_id":"d3IqsW0RRkOqXsJXjq4OvQ"}```
