# DevOps Dashboard API

A production-grade Kubernetes cluster monitoring REST API built with NestJS and TypeScript. Connects directly to a live Kubernetes cluster, integrates with Prometheus for real metrics, and persists historical data in PostgreSQL. Built against a real on-premise cluster running enterprise blockchain infrastructure.

## Features

- **Cluster overview** — real-time node count, pod health, deployment status, and a calculated health score
- **Pod monitoring** — list, filter by namespace, detect crash-looping pods, pod stats breakdown
- **Node metrics** — CPU and memory capacity, allocatable resources, node conditions and health
- **Deployment health** — replica status, desired vs ready comparison, unhealthy deployment detection
- **Namespace summaries** — per-namespace pod count, deployment count, and health score
- **Real metrics from Prometheus** — actual CPU and memory usage per namespace via PromQL, not estimates
- **Historical data** — PostgreSQL-backed metric snapshots with delta detection (only writes on change)
- **Alerting engine** — detects crash-looping pods, unhealthy deployments, and unready nodes with deduplication and auto-resolution
- **Redis caching** — cache-aside pattern on all Kubernetes API calls for fast repeated queries
- **Background jobs** — Bull queue runs metric collection every 30 seconds
- **Swagger docs** — full interactive API documentation at `/api`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS + TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Cache | Redis |
| Queue | Bull |
| K8s Client | @kubernetes/client-node |
| Metrics | Prometheus (PromQL via HTTP) |
| Docs | Swagger / OpenAPI |
| Container | Docker + Docker Compose |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    NestJS API                        │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │  Pods    │ │  Nodes   │ │     Deployments      │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │Namespaces│ │ Metrics  │ │       Alerts         │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
│                                                      │
│  ┌─────────────────────┐  ┌───────────────────────┐ │
│  │  KubernetesService  │  │  PrometheusService    │ │
│  │  (k8s API wrapper)  │  │  (PromQL queries)     │ │
│  └─────────────────────┘  └───────────────────────┘ │
└──────────────┬──────────────────────┬────────────────┘
               │                      │
    ┌──────────▼──────────┐  ┌────────▼────────────────┐
    │  Kubernetes Cluster  │  │      Prometheus          │
    │  (on-premise VMs)    │  │   (NodePort :30909)      │
    └─────────────────────┘  └─────────────────────────┘
               │
    ┌──────────▼──────────┐  ┌─────────────────────────┐
    │     PostgreSQL       │  │         Redis            │
    │  (metric snapshots   │  │  (cache + Bull queues)   │
    │   + alert history)   │  └─────────────────────────┘
    └─────────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- kubectl configured with access to a Kubernetes cluster
- Prometheus accessible via NodePort or port-forward

### Installation

```bash
# Clone the repo
git clone https://github.com/EYOSIYAS7/devops-dashboard-api
cd devops-dashboard-api

# Install dependencies
npm install

# Start PostgreSQL and Redis
docker-compose up -d

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Run database migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Start the API
npm run start:dev
```


## How the Caching Works

Every Kubernetes API call is wrapped in a cache-aside pattern using Redis:

1. Incoming request → check Redis for cached data
2. Cache HIT → return immediately (fast path)
3. Cache MISS → fetch from Kubernetes API → store in Redis with 30s TTL → return
4. After each metrics snapshot → invalidate all `k8s:*` keys so next request gets fresh data

This prevents repeated hammering of the cluster API on every HTTP request while keeping data fresh.

## How the Alerting Works

The alert detector runs after every metrics snapshot and checks three conditions:

- **CRASH_LOOP** — any pod with container restart count > 5
- **DEPLOYMENT_FAILED** — any deployment with readyReplicas < desiredReplicas
- **NODE_NOT_READY** — any node whose Ready condition is not True

Alerts are deduplicated — if an unresolved alert already exists for a resource, no duplicate is created. When a condition clears (deployment becomes healthy, node recovers), the alert is automatically resolved with a `resolvedAt` timestamp.

## How Delta Detection Works

The metrics collector only writes a new PostgreSQL snapshot when data has actually changed:

- Pod count change of any amount → write
- CPU usage change > 0.05 cores → write
- Memory usage change > 0.05 GiB → write
- No meaningful change → skip

This reduces database writes significantly on stable clusters — typically 60–70% of snapshots are skipped.


## Swagger Documentation

Once running, interactive API docs are available at:

```
http://localhost:3000/api
```

