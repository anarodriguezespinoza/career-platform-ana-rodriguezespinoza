# How do I know my data to your site is encrypted?

When I go to my domain, anarodriguezespinoza.com, my browser and my server do a secure connection set-up. The server uses a certificate from Let's Encrypt, which browsers already trust. After the secure set-up process, everything being sent and what gets back (forms, cookies, page content) is encrypted while it travels over the internet.

## 1. The certificate

For the certificate, I ran `sudo certbot certificates` after I SSH into the vm's directory:

With the help of claude, this is the information gathered:
- **Issuer:** Let's Encrypt, a nonprofit certificate authority that all major browsers trust.
- **Domains:** `anarodriguezespinoza.com` and `www.anarodriguezespinoza.com`.
- **Expires:** 2027-01-04 at 21:03:44 UTC.

## 2. Renewal

The certificates only last 90 days, so renewal has to be automatic. The certbot package sets up `certbot.timer` for this. It runs twice a day, but certbot only requests a new cert when the current one is within 30 days of expiring. Most runs do nothing.

With the help of Claude, I checked that the timer is running through:

- `systemctl status certbot.timer` showed `active (waiting)` and enabled.
- `systemctl list-timers certbot.timer` showed the next run in about 2 hours.

To see that the renewal would actually work, I ran a dry run like the guide says. It does the whole process, including proving to the certificate that I control the domain, but doesn't install a new certification.

'sudo certbot renew --dry-run'

All the renewals succeeded, so a new renewal would work today if the cert were close to expiring.

## 3. Which ports are open, and why

I pulled the VM's network security group rules with `az network nsg rule list` and it let me know that port 22 (for the ssh key), port 80 (for HTTP), and port 443 (for HTTPS) were all open as they're needed for the domain to be up and running securely. The SSH port can only be reached by own computer's IP address through the SSH rule that was added in the inbound port rules for the VM.


## 4. Where the encryption starts and stops

The certificate is installed on nginx, not on the FASTApi. Nginx ends the HTTPS connection, decrypts the request, and passes it to the FASTAPI over plain HTTP. So the nginx-to-FASTAPI transition is not encrypted. 

This was confirmed with Claude in two ways:
- The nginx config has `proxy_pass http://127.0.0.1:8000;`.
- `sudo ss -tlnp` shows uvicorn listening only on `127.0.0.1:8000`, never `0.0.0.0:8000`.

This is still safe because 127.0.0.1 is the same machine. It only exists inside the VM, so nothing from outside can reach it. The only part that crosses the public internet is browser-to-nginx, and that's the part the certificate protects.

## 5. How to check this in Chrome

1. Go to `https://anarodriguezespinoza.com`.
2. Click the icon left of the domain in the address bar.
3. Click **"Connection is secure."**
4. Click **"Certificate is valid."** You'll see that Let's Encrypt issued it and the dates it's valid.

## 6. Raw proof: querying the certificate directly

I asked the live site for its certificate from my laptop today. I ran it again while writing this and got the same result:

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

This is the cert the server actually gives to anyone who reaches the domain. It matches what `certbot certificates` showed on the VM, so the server is presenting the real cert and not an old or wrong one.
