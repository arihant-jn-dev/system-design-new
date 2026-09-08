# Why Kubernetes?

Kubernetes (often abbreviated as K8s) is an open-source platform that automates the deployment, scaling, and management of containerized applications. It essentially acts as a smart manager or "conductor" for your containers, taking the manual labor out of running complex, large-scale applications across multiple servers.

## Before Kubernetes

Before Kubernetes, companies used to do this:

```text
          AWS EC2 Server

        +-------------------+
        |                   |
        |  Docker Container |
        |                   |
        +-------------------+
```

**Problem:**

1. If the server dies
   - EC2 ❌
   - Entire application is down.
2. If traffic suddenly increases
   - 100 users → 10,000 users
   - One server can't handle it.

Companies needed something that could:

- restart crashed applications
- create more copies automatically
- distribute traffic
- update applications without downtime
- schedule containers on many machines

That's Kubernetes.

Think of Kubernetes as: **an operating system for a datacenter.**
Just like macOS manages processes on your laptop, Kubernetes manages containers across hundreds of servers.

## Kubernetes Architecture

```text
                   Kubernetes Cluster
                           │
        ┌──────────────────┴───────────────────┐
        │                                       │
   Control Plane                          Worker Nodes
        │                                       │
        │                                       ├──────── Node 1
        │                                       │       ├── Pod
        │                                       │       ├── Pod
        │                                       │
        │                                       ├──────── Node 2
        │                                       │       ├── Pod
        │                                       │
        │                                       └──────── Node 3
```

### 1. Control Plane — The brain

It decides:

- where to run containers
- when to restart them
- when to create more pods
- networking
- health checks

It usually doesn't run your application.

### 2. Worker Nodes

These are actual EC2 machines.

```text
EC2 Machine 1
16 CPU
64GB RAM
```

Inside this EC2: Docker/containerd runs. Your application actually runs here.

```text
EC2
│
├── Container Runtime
│
├── Pod
├── Pod
├── Pod
```

## Docker's Role

Suppose your NestJS application:

```bash
npm install
npm run build
node dist/main.js
```

Instead of running directly, you package it into a Docker image.

**Dockerfile:**

```dockerfile
FROM node:22
COPY .
RUN npm install
RUN npm run build
CMD node dist/main.js
```

- build: `docker build`
- produces: `apiserver:v25`
- push to registry: AWS ECR or DockerHub

Kubernetes never builds images. It only pulls them.

```text
AWS ECR
      │
      ▼
Kubernetes
      │
docker pull
      │
Run Container
```

## Node

A Node is simply an EC2 machine.

```text
Node 1
16 CPU
64GB RAM

Node 2
8 CPU
32GB RAM
```

Inside every node:

```text
Node
├── Linux
├── Container Runtime
├── kubelet
└── Pods
```

## Pod

A Pod is the smallest deployable unit in Kubernetes. It can contain one or more containers.

Suppose your application image is `apiserver:v25`, running it creates a **Container**.

Kubernetes wraps that container inside a **Pod**.

## Cluster

A Cluster is a group of machines.

```text
Kubernetes Cluster
├── Node 1
├── Node 2
└── Node 3
```

## kubelet

Every node has a kubelet — the manager of that machine.

Control Plane says: "Run 4 Pods."
kubelet hears: "okay then."

```text
Download Docker image
↓
Start Container
↓
Monitor Health
↓
Restart if crashed
```

### Example using your project: qav3 deployment

Suppose Deployment says: need 4 replicas. Kubernetes creates:

```text
Node 1
├── Pod
├── Pod

Node 2
├── Pod

Node 3
├── Pod

Total Pods = 4
```

### Where are these Pods physically?

Imagine this EC2 machine:

```text
EC2
64 GB RAM
16 CPU
```

Pods actually consume that RAM.

```text
Node
64GB RAM
├── Pod 1 (2GB)
├── Pod 2 (4GB)
├── Pod 3 (8GB)
└── Pod 4 (1GB)
```

Pods are using the node's resources.

## Scheduler

Who decides which Node gets the Pod? This is the **Scheduler**.

Suppose:

```text
Node1 — Free RAM: 50GB
Node2 — Free RAM: 2GB
Node3 — Free RAM: 10GB
```

New Pod needs: 8GB RAM

Scheduler checks:

- Node1 ✔
- Node2 ❌
- Node3 ✔

Maybe it selects: Node3. Then kubelet on Node3 creates it.

```text
Control Plane
        │
Scheduler chooses Node
        │
Node 2 (chosen)
        │
kubelet
        │
containerd
        │
Docker Image
        │
Container
        │
Pod
```

Every single Pod in Kubernetes is created like this.

### Why multiple Nodes?

If there's a single Node and that Node crashes, everything is gone. This is one of the biggest advantages of Kubernetes — spreading pods across multiple nodes avoids a single point of failure.

## Hierarchy

```text
AWS Account
│
├── EKS Cluster
│     │
│     ├── Control Plane
│     │
│     └── Worker Nodes (EC2)
│            │
│            ├── kubelet
│            ├── containerd
│            ├── Pod
│            ├── Pod
│            └── Pod
│
├── RDS
├── Redis
└── S3
```

Notice that RDS, Redis, and S3 are not inside the Kubernetes cluster in a typical AWS setup — they're separate managed AWS services that your pods connect to.

## Component Reference

| Component | Description |
|---|---|
| **Docker Image** | Packages your application and dependencies. |
| **Container Runtime (containerd/Docker)** | Runs the Docker image on a node. |
| **Pod** | Smallest deployable unit; contains one or more containers. |
| **Node** | EC2 machine that hosts pods. |
| **Deployment** | Ensures the desired number of pods are running and manages rolling updates. |
| **ReplicaSet** | Keeps the requested number of pod replicas alive (managed by the Deployment). |
| **Service** | Provides a stable virtual IP and load-balances traffic to matching pods. |
| **Ingress** | Routes external HTTP/HTTPS requests to the correct service based on host/path rules. |
| **Scheduler** | Chooses which node should run a newly created pod. |
| **kubelet** | Agent on every node that starts, stops, and monitors pods. |
| **ArgoCD** | Watches Git and applies Kubernetes manifests (GitOps). |

## What Happens When You Push Code?

```text
Your Laptop
      │
git push
      │
GitLab Repository
      │
Reads .gitlab-ci.yml
      │
Starts Pipeline
```

Now the pipeline begins:

### Build Stage

The Build stage's job is **NOT** Kubernetes.

**Responsibility:** Convert source code into a Docker image.

```text
NestJS Code
↓
Docker Build
↓
Docker Image
```

**Where is the Docker image stored?** AWS ECR

```text
Pipeline
↓
docker push
↓
AWS ECR
↓
leadgen-api:v145
```

### Deployment

```text
                   DEVELOPER
                       │
                       │ git push stage
                       ▼
             GitLab Repository (leadgen)
                       │
                       │
              Reads .gitlab-ci.yml
                       │
                       ▼
                GitLab Pipeline Starts
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
    BUILD STAGE                 DEPLOY STAGE
        │                             │
        │ docker build                │ Update image tag
        │                             │ in Helm/YAML
        ▼                             ▼
 Docker Image Created         GitOps Repository Updated
 leadgen-api:v145                     │
        │                             │
        │ docker push                 │
        ▼                             ▼
      AWS ECR                  ArgoCD detects change
        │                             │
        └──────────────┬──────────────┘
                       │
                       ▼
                Kubernetes Cluster
                       │
              Deployment updated
        image: leadgen-api:v145
                       │
                       ▼
              Rolling Update Starts
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   Create New      Wait Until     Delete Old
      Pod           Healthy          Pod
        │
        ▼
   Pull Image from ECR
        │
        ▼
   Start Container
        │
        ▼
   Readiness Probe OK
        │
        ▼
Service starts routing traffic
to the new Pod
```

## What Kubernetes is Doing Internally

**Deployment** — Image: `leadgen-api:v144`

```text
           Service
               │
        ┌──────┼──────┐
        ▼      ▼      ▼
     Pod A   Pod B   Pod C
      v144    v144    v144
```

Pipeline builds: `leadgen-api:v145`

Deploy changes only one thing:

```yaml
image:
  repository: leadgen-api
  tag: v145
```

Kubernetes starts a **rolling update**.

**Step 1**

```text
           Service
               │
   ┌───────────┼────────────┐
   ▼           ▼            ▼
Pod A(v144) Pod B(v144) Pod C(v144)

                     +
                 Pod D(v145)
                 Starting...
```

Traffic still goes only to healthy old pods.

**Step 2**

```text
           Service
               │
   ┌───────────┼───────────────┐
   ▼           ▼               ▼
Pod A(v144) Pod B(v144)   Pod D(v145)
```

Now Kubernetes removes one old pod: **Pod C Deleted**.
Same process for other pods until all old pods are replaced with new pods.

**Final State**

```text
           Service
               │
      ┌────────┼────────┐
      ▼        ▼        ▼
   Pod D     Pod E    Pod F
    v145      v145     v145
```

Users never notice because the Service always routes traffic only to healthy pods.
