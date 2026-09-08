# High Level Architecture

Request path for a user opening the website, from the public internet all the
way down to the data layer.

## Traffic Flow

```text
                        Internet
                            │
                            │
                     User opens website
                            │
                            ▼
                   Cloudflare DNS + Proxy
                (SSL, WAF, CDN, DDoS Protection)
                            │
                            │
                            ▼
                  AWS Load Balancer (ALB/NLB)
                            │
                            ▼
                     Kubernetes Ingress
                            │
                            ▼
                    Kubernetes Service
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ▼                             ▼
      API Server Pod 1              API Server Pod 2
             │                             │
             └──────────────┬──────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
      Redis             Database          External APIs
      (AWS)            (AWS RDS)
```

## Layers at a Glance

| Layer | Component | Responsibility |
|---|---|---|
| Edge | Cloudflare DNS + Proxy | SSL, WAF, CDN, DDoS Protection |
| Network | AWS Load Balancer (ALB/NLB) | Distributes incoming traffic |
| Cluster entry | Kubernetes Ingress | Routes external requests into the cluster |
| Cluster routing | Kubernetes Service | Load-balances to matching pods |
| Compute | API Server Pod 1 / Pod 2 | Runs the application |
| Data | Redis (AWS), Database (AWS RDS), External APIs | State and downstream dependencies |
