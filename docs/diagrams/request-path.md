# Request path: entering the domain in a browser

Assumptions: a new HTTPS connection over TCP, and a DNS lookup with no cached answer. Items marked **?** are not recorded in this repository and still need to be checked.

## Railway

```mermaid
flowchart LR
  subgraph home["Home network, private addresses (values from your Ex01 notes)"]
    laptop["Laptop browser<br/>NIC + Wi-Fi<br/>private IP, subnet, gateway, DNS from DHCP"]
    ap["Access point"]
    sw["Switch"]
    rtr["Router = default gateway<br/>NAT: private → public IP<br/>stateful firewall, DHCP server"]
    laptop -- "Wi-Fi" --- ap --- sw --- rtr
  end
  modem["Modem / ONT"]
  isp["ISP"]
  net["Internet routers"]
  rtr --- modem --- isp --- net

  resolver["DNS resolver ?<br/>router, ISP, or 1.1.1.1"]
  cf["Cloudflare authoritative DNS<br/>CNAME anarodriguezespinoza.com → jf53ce39.up.railway.app<br/>DNS only, flattened to A records"]

  subgraph rw["Railway"]
    edge["Railway edge<br/>TLS ends here<br/>http → https redirect ?"]
    app["uvicorn app (container)<br/>listens on $PORT<br/>--proxy-headers"]
    pg[("PostgreSQL<br/>postgres.railway.internal")]
  end
  ga["Google Analytics<br/>only after consent"]

  laptop -. "1 DNS query · UDP 53<br/>client: laptop → server: resolver" .-> resolver
  resolver -. "recursive lookup" .-> cf
  resolver -. "answer: edge IP" .-> laptop

  net == "2 TCP 443 + TLS<br/>client: browser → server: edge<br/>public" ==> edge
  edge == "3 plain HTTP + X-Forwarded-Proto<br/>client: edge → server: app<br/>private" ==> app
  app == "4 SQL over TCP · private<br/>client: app → server: Postgres" ==> pg
  app -. "5 HTML response, back the same way<br/>then /static CSS + JS requests" .-> net
  laptop -. "6 HTTPS event hits from the browser" .-> ga
```

## Azure

```mermaid
flowchart LR
  path["Laptop → AP → switch → router/NAT → modem → ISP → internet<br/>(same as the Railway diagram)"]
  resolver["DNS resolver ?"]
  cf["Cloudflare DNS<br/>A anarodriguezespinoza.com → 9.205.26.169<br/>(Azure era)"]

  subgraph az["Azure · Denmark East · vm-career-platform"]
    nsg["NSG firewall<br/>22 from laptop IP only<br/>80, 443 from anywhere<br/>no 8000 rule"]
    subgraph vm["Ubuntu VM"]
      nginx["Nginx :443, Let's Encrypt cert<br/>TLS ends here<br/>:80 → 301 to https"]
      app["uvicorn under systemd<br/>user azureuser<br/>127.0.0.1:8000"]
      db[("SQLite file<br/>~/career-platform/data.db")]
    end
  end

  path -. "1 DNS query · UDP 53" .-> resolver -. "lookup" .-> cf
  path == "2 TCP 443 + TLS<br/>client: browser → server: Nginx<br/>public 9.205.26.169" ==> nsg ==> nginx
  nginx == "3 plain HTTP, loopback<br/>proxy_pass 127.0.0.1:8000" ==> app
  app == "4 file reads, no network" ==> db
```

## What changes between the two hosts

| | Azure | Railway |
| --- | --- | --- |
| DNS record | A record → VM public IP | CNAME → Railway, flattened |
| Firewall you manage | NSG rules | None, Railway owns the entry point |
| TLS ends at | Nginx on your VM, certbot renews | Railway edge, Railway renews |
| App to database | Local file, no network | TCP over Railway's private network |
| Keeps the app running | systemd, which you configured | Railway restart policy (`railway.json`) |

## Still to check

- Which DNS resolver the laptop uses: `scutil --dns`
- Whether Railway's edge redirects http to https: `curl -I http://anarodriguezespinoza.com`
- Home network addresses from Exercise 01
- Whether the Postgres port is 5432: read it from `DATABASE_URL` without printing the password
