# DNS records before Zoho Mail setup

**Captured:** 2026-10-13 14:10 PDT
**Zone:** `anarodriguezespinoza.com`
**Command:** `cf dns records list --zone anarodriguezespinoza.com`

## Summary

| Type | Name | Content | Proxied | TTL | Created |
|---|---|---|---|---|---|
| A | `www.anarodriguezespinoza.com` | `9.205.26.169` | No | Auto | 2026-10-01 |
| CNAME | `anarodriguezespinoza.com` | `jf53ce39.up.railway.app` | No | Auto | 2026-10-08 |
| TXT | `_railway-verify.anarodriguezespinoza.com` | `"railway-verify=cd60128934246f9fb9208b3491734b41cfa3bdd179ad03f9ea20aebf6b14dcfe"` | No | Auto | 2026-10-08 |

3 records in total. There are no MX, SPF, DKIM or DMARC records yet.

## Raw output

```json
[
  {
    "id": "7c7b501a8318f2c2e80e50a6a20e343c",
    "name": "www.anarodriguezespinoza.com",
    "type": "A",
    "content": "9.205.26.169",
    "proxiable": true,
    "proxied": false,
    "ttl": 1,
    "settings": {},
    "meta": {},
    "comment": null,
    "tags": [],
    "created_on": "2026-10-01T21:41:16.82029Z",
    "modified_on": "2026-10-01T21:41:16.82029Z"
  },
  {
    "id": "778f05edb04ab8e296fc222039d35615",
    "name": "anarodriguezespinoza.com",
    "type": "CNAME",
    "content": "jf53ce39.up.railway.app",
    "proxiable": true,
    "proxied": false,
    "ttl": 1,
    "settings": {
      "flatten_cname": false
    },
    "meta": {},
    "comment": null,
    "tags": [],
    "created_on": "2026-10-08T22:18:55.930374Z",
    "modified_on": "2026-10-08T22:18:55.930374Z"
  },
  {
    "id": "25696306ab92f8abcce539c26db9fdb6",
    "name": "_railway-verify.anarodriguezespinoza.com",
    "type": "TXT",
    "content": "\"railway-verify=cd60128934246f9fb9208b3491734b41cfa3bdd179ad03f9ea20aebf6b14dcfe\"",
    "proxiable": false,
    "proxied": false,
    "ttl": 1,
    "settings": {},
    "meta": {},
    "comment": null,
    "tags": [],
    "created_on": "2026-10-08T22:19:48.072455Z",
    "modified_on": "2026-10-08T22:19:48.072455Z"
  }
]
```
