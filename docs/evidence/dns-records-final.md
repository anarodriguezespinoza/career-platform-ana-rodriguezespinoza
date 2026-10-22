# Final DNS records (after the Zoho and `www` changes)

**Captured:** 2026-10-21 18:46 PDT (2026-10-22 01:46 UTC)
**Zone:** `anarodriguezespinoza.com` on Cloudflare (nameservers `grant.ns.cloudflare.com`, `monroe.ns.cloudflare.com`)
**Command:** `cf dns records list --zone anarodriguezespinoza.com`
**Earlier dump:** [dns-before-zoho.md](dns-before-zoho.md) (2026-10-13, 3 records)

## What changed since the earlier dump

| When (UTC) | Change |
| --- | --- |
| 2026-10-13 21:23 – 22:01 | Zoho records added: verification TXT, three MX, SPF, DKIM (`zmail`), DMARC |
| 2026-10-22 01:44 | `www` A record switched from DNS only to **proxied**, so the existing Cloudflare redirect rule now runs |

## Records, purpose, and verification

| Type | Name | Content | Proxied | Purpose | Verification (2026-10-21) |
| --- | --- | --- | --- | --- | --- |
| CNAME | `@` | `jf53ce39.up.railway.app` | No | Sends the root domain to Railway. Cloudflare flattens it to A records (`69.46.46.19`) | `dig` returns `69.46.46.19`; TLS to it verifies (Let's Encrypt `YE2`, CN `anarodriguezespinoza.com`). The app behind it returned **502** at check time, see [https-checks.md](https-checks.md) |
| TXT | `_railway-verify` | `railway-verify=cd60…dcfe` | No | Proves to Railway that I own the domain, so Railway will serve and issue a certificate for it | Railway serves a certificate issued for `anarodriguezespinoza.com`, which it only does for a verified domain |
| A | `www` | `9.205.26.169` | **Yes** | Gives `www` a proxied name so the Cloudflare redirect rule "Redirect from WWW to root" can answer it. The origin IP is never contacted, because the rule answers first | `http://www…/` and `https://www…/` both return `301` to `https://anarodriguezespinoza.com/`, path and query kept; certificate `*.anarodriguezespinoza.com` verifies |
| MX 10 / 20 / 50 | `@` | `mx.zoho.com`, `mx2.zoho.com`, `mx3.zoho.com` | No | Tells other mail servers to deliver `@anarodriguezespinoza.com` mail to Zoho, trying the lowest number first | "Test 01: Inbound" from Gmail arrived in the Zoho inbox (2026-10-13 14:54 PDT); Zoho reports `mxStatus: true` |
| TXT | `@` | `zoho-verification=zb65215164.zmverify.zoho.com` | No | Proves domain ownership to Zoho during mailbox setup | Zoho accepted the domain and created `ana@anarodriguezespinoza.com` |
| TXT | `@` | `v=spf1 include:zohomail.com ~all` | No | SPF: lists the servers allowed to send mail for the domain | Gmail: `SPF: PASS with IP 165.173.180.52` on "Re: Test 01: Inbound" |
| TXT | `zmail._domainkey` | `v=DKIM1; k=rsa; p=MIGf…` | No | DKIM public key; receivers use it to check Zoho's signature on outgoing mail | Gmail: `DKIM: 'PASS' with domain anarodriguezespinoza.com` |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:ana@anarodriguezespinoza.com` | No | DMARC: asks receivers to check that SPF or DKIM aligns with the From domain, and to send reports. `p=none` means report only, don't block | Gmail: `DMARC: 'PASS'`; Google aggregate reports arrived in the Zoho inbox on 2026-10-15 and 2026-10-19 |

Mail records must stay **DNS only**: Cloudflare's proxy only carries HTTP(S), so a proxied mail record would break delivery.

## Raw output

Trimmed to the fields that matter (`settings`, `meta`, `tags`, `comment` were empty on every record).

```json
[
  {
    "id": "7c7b501a8318f2c2e80e50a6a20e343c",
    "name": "www.anarodriguezespinoza.com",
    "type": "A",
    "content": "9.205.26.169",
    "proxied": true,
    "ttl": 1,
    "created_on": "2026-10-01T21:41:16.82029Z",
    "modified_on": "2026-10-22T01:44:41.175138Z"
  },
  {
    "id": "778f05edb04ab8e296fc222039d35615",
    "name": "anarodriguezespinoza.com",
    "type": "CNAME",
    "content": "jf53ce39.up.railway.app",
    "proxied": false,
    "ttl": 1,
    "created_on": "2026-10-08T22:18:55.930374Z",
    "modified_on": "2026-10-08T22:18:55.930374Z"
  },
  {
    "id": "ef5ca58bb9f2bdac05f9b8e26b1ab439",
    "name": "anarodriguezespinoza.com",
    "type": "MX",
    "content": "mx3.zoho.com",
    "priority": 50,
    "proxied": false,
    "ttl": 1,
    "created_on": "2026-10-13T21:37:02.985628Z",
    "modified_on": "2026-10-13T21:37:02.985628Z"
  },
  {
    "id": "b5fa1123e63d10ccaba0eb86ee86379e",
    "name": "anarodriguezespinoza.com",
    "type": "MX",
    "content": "mx2.zoho.com",
    "priority": 20,
    "proxied": false,
    "ttl": 1,
    "created_on": "2026-10-13T21:36:46.588411Z",
    "modified_on": "2026-10-13T21:36:46.588411Z"
  },
  {
    "id": "42a5a2d8a55205a9b4db7cc399321dd4",
    "name": "anarodriguezespinoza.com",
    "type": "MX",
    "content": "mx.zoho.com",
    "priority": 10,
    "proxied": false,
    "ttl": 1,
    "created_on": "2026-10-13T21:36:28.703138Z",
    "modified_on": "2026-10-13T21:36:28.703138Z"
  },
  {
    "id": "a9b1318aadea7eca0b2894e79517755c",
    "name": "anarodriguezespinoza.com",
    "type": "TXT",
    "content": "\"v=spf1 include:zohomail.com ~all\"",
    "proxied": false,
    "ttl": 1,
    "created_on": "2026-10-13T21:42:39.619663Z",
    "modified_on": "2026-10-13T21:42:39.619663Z"
  },
  {
    "id": "e8651778692360d521659b06167e642f",
    "name": "anarodriguezespinoza.com",
    "type": "TXT",
    "content": "\"zoho-verification=zb65215164.zmverify.zoho.com\"",
    "proxied": false,
    "ttl": 1,
    "created_on": "2026-10-13T21:23:35.933832Z",
    "modified_on": "2026-10-13T21:23:35.933832Z"
  },
  {
    "id": "0663f6732d2262c89e95500571ed0879",
    "name": "_dmarc.anarodriguezespinoza.com",
    "type": "TXT",
    "content": "\"v=DMARC1; p=none; rua=mailto:ana@anarodriguezespinoza.com\"",
    "proxied": false,
    "ttl": 1,
    "created_on": "2026-10-13T22:01:17.302915Z",
    "modified_on": "2026-10-13T22:01:17.302915Z"
  },
  {
    "id": "25696306ab92f8abcce539c26db9fdb6",
    "name": "_railway-verify.anarodriguezespinoza.com",
    "type": "TXT",
    "content": "\"railway-verify=cd60128934246f9fb9208b3491734b41cfa3bdd179ad03f9ea20aebf6b14dcfe\"",
    "proxied": false,
    "ttl": 1,
    "created_on": "2026-10-08T22:19:48.072455Z",
    "modified_on": "2026-10-08T22:19:48.072455Z"
  },
  {
    "id": "7f236833adaeed3f848b8826b34e396c",
    "name": "zmail._domainkey.anarodriguezespinoza.com",
    "type": "TXT",
    "content": "\"v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCKZJC+ALzcVNFzjcB1x45wsFQIUwj18ufXxrF7NasDhjoq5Coh62V6raWp1aRuCuMCQvbDmh9E8AQ3g7GIGWPRp/Ec2PUdSUdNVsMbaR7UG3AB8n2HIlXHbuLz9tV0o9/k6O1T8tKXCmY7vqXyx/qbYohNGvg81pa/Z9xz3Q5uxQIDAQAB\"",
    "proxied": false,
    "ttl": 1,
    "created_on": "2026-10-13T21:46:29.539647Z",
    "modified_on": "2026-10-13T21:46:29.539647Z"
  }
]
```
