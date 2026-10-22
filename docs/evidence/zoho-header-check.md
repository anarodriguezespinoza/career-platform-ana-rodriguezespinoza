# Zoho header check

**Message:** "Re: Test 01: Inbound", sent from Zoho (`ana@anarodriguezespinoza.com`) to Gmail on 2026-10-19 19:48:49 PDT.
**Source:** Gmail → open the message → ⋮ → **Show original**.

## Summary Gmail shows above the headers

```text
SPF:	PASS with IP 165.173.180.52
DKIM:	'PASS' with domain anarodriguezespinoza.com
DMARC:	'PASS'
```

## Raw headers

**TODO:** paste the headers here from "Show original" (everything above the message body), with these removed: your Gmail address in `Delivered-To` / `To` is fine to keep (decision in [ex06.md](ex06.md)), but delete any `X-Google-Smtp-Source` / `X-Received` lines if you prefer. They're Google-internal and not needed.

```text
(paste here)
```

## Analysis

Fill in the **Value** column from the pasted headers. The **What it shows** column says what to look for.

| Header | Value | What it shows |
| --- | --- | --- |
| `From:` | TODO | Expect `ana@anarodriguezespinoza.com`: the visible sender is the custom domain, not Gmail or zoho.com |
| `Return-Path:` | TODO | The envelope sender that SPF checks. Expect an `@anarodriguezespinoza.com` address, so SPF's domain **aligns** with `From:` |
| Last `Received:` (bottom-most) | TODO | Where the message entered the internet: a Zoho outbound host such as `*.zoho.com` / `*.zohomail.com` with IP `165.173.180.52` |
| First `Received:` (top-most) | TODO | Gmail's MX (`mx.google.com`) receiving it over TLS. Read the `Received:` chain from bottom to top to follow the hops |
| `Received-SPF:` | TODO | `pass`: Google checked `165.173.180.52` against `v=spf1 include:zohomail.com ~all` and the IP is in Zoho's ranges |
| `DKIM-Signature:` | TODO: copy `d=` and `s=` | `d=anarodriguezespinoza.com; s=zmail`: signed with the key published at `zmail._domainkey.anarodriguezespinoza.com` |
| `Authentication-Results:` | TODO | Google's verdict line: `spf=pass`, `dkim=pass header.i=@anarodriguezespinoza.com`, `dmarc=pass (p=NONE …) header.from=anarodriguezespinoza.com` |
| `ARC-*` headers | (present / absent) | Added by Google to preserve the authentication result if the message is forwarded later. Not something I configured |

## Conclusion

DMARC passes because **both** SPF and DKIM pass with domains that align with the `From:` domain. Either one alone would have been enough. Zoho sends from its own IPs, which SPF authorizes through `include:zohomail.com`, and signs with the `zmail` key, so receivers can verify mail from `ana@anarodriguezespinoza.com` without trusting Zoho's word for it.
