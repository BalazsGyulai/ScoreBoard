# CI/CD Guide — HomeGame

> How senior engineers set up CI/CD pipelines, what goes in them, and
> ready-to-use GitHub Actions workflows for this project.

---

## Table of Contents

1. [What Is CI/CD and Why Do You Need It?](#1-what-is-cicd-and-why-do-you-need-it)
2. [CI vs CD — The Difference](#2-ci-vs-cd--the-difference)
3. [The Mental Model](#3-the-mental-model)
4. [GitHub Actions Basics](#4-github-actions-basics)
5. [CI Pipeline for HomeGame](#5-ci-pipeline-for-homegame)
6. [CD Pipeline for HomeGame](#6-cd-pipeline-for-homegame)
7. [Docker Setup](#7-docker-setup)
8. [Common Patterns and Tips](#8-common-patterns-and-tips)
9. [Security](#9-security)
10. [Cost](#10-cost)

---

## 1. What Is CI/CD and Why Do You Need It?

**Without CI/CD:**
```
You:    "I'll just push and deploy manually"
Monday: Push code that breaks login → deploy → users can't log in
Tuesday: "Wait, did the tests pass?" → you forgot to run them
```

**With CI/CD:**
```
You:    Push code → GitHub runs tests automatically
GitHub: "Tests failed — login handler returns 500" → blocks merge
You:    Fix it → push again → tests pass → auto-deploy
```

### CI/CD is a safety net, not bureaucracy.

It catches bugs before they reach users. That's it. Everything else
(fancy dashboards, deployment strategies) is secondary.

---

## 2. CI vs CD — The Difference

| | CI (Continuous Integration) | CD (Continuous Deployment) |
|--|---|---|
| **When** | Every push / PR | After merge to `main` |
| **What** | Build + test + lint | Build Docker images + deploy |
| **Goal** | "Does this code work?" | "Ship it to production" |
| **Blocks merge?** | Yes (if tests fail) | No (main is always deployable) |

### For HomeGame:

```
Feature branch → [CI: test + lint] → PR review → merge to main → [CD: deploy]
```

---

## 3. The Mental Model

Think of CI/CD as a checklist that runs automatically:

```
CI checklist (every push):
  □ Does the Rust API compile?                   (cargo check)
  □ Do the API tests pass?                       (cargo test)
  □ Does the frontend compile?                   (tsc --noEmit)
  □ Do the frontend tests pass?                  (vitest run)
  □ Does the linter find issues?                 (eslint)
  □ Can we build Docker images?                  (docker build)

CD checklist (merge to main):
  □ All CI checks passed?                        (required)
  □ Build production Docker images               (docker build --target prod)
  □ Push images to registry                      (ghcr.io or Docker Hub)
  □ SSH into server and pull new images           (docker compose pull)
  □ Restart services                             (docker compose up -d)
  □ Run database migrations                      (sqlx migrate run)
  □ Health check passes                          (curl /health → 200)
```

---

## 4. GitHub Actions Basics

### Concepts

| Concept | What it is | Example |
|---------|-----------|---------|
| **Workflow** | A YAML file in `.github/workflows/` | `ci.yml` |
| **Trigger** | When the workflow runs | `on: push`, `on: pull_request` |
| **Job** | A group of steps that runs on one machine | `test-api`, `test-web` |
| **Step** | A single command or action | `run: cargo test` |
| **Action** | A reusable step from the marketplace | `actions/checkout@v4` |
| **Service** | A Docker container alongside your job | PostgreSQL for tests |
| **Secret** | An encrypted variable | `SSH_KEY`, `DATABASE_URL` |
| **Artifact** | A file saved between jobs | Docker image, test report |

### File location

```
.github/
└── workflows/
    ├── ci.yml       ← runs on every PR
    └── deploy.yml   ← runs on merge to main
```

### Minimal example

```yaml
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Hello CI!"
```

That's a complete, working pipeline. Everything below builds on this.

---

## 5. CI Pipeline for HomeGame

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# Cancel in-progress runs for the same branch (saves CI minutes)
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ════════════════════════════════════════════════════════════
  #  Rust API
  # ════════════════════════════════════════════════════════════
  api-check:
    name: "API: check + clippy"
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/api
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy

      # Cache Cargo registry + build artifacts
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: "apps/api -> target"

      - run: cargo check
      - run: cargo clippy -- -D warnings

  api-test:
    name: "API: tests"
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/api

    # PostgreSQL service container — available at localhost:5432
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: homegame_test
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: homegame_test
        ports:
          - 5432:5432
        # Wait until Postgres is ready before running tests
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgres://homegame_test:test_password@localhost:5432/homegame_test
      JWT_SECRET: ci-test-secret-not-for-production

    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: "apps/api -> target"

      # Run migrations before tests
      - name: Install sqlx-cli
        run: cargo install sqlx-cli --no-default-features --features postgres

      - name: Run migrations
        run: sqlx migrate run

      - name: Run tests
        run: cargo test --all

  # ════════════════════════════════════════════════════════════
  #  Next.js Frontend
  # ════════════════════════════════════════════════════════════
  web-check:
    name: "Web: typecheck + lint"
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"
          cache-dependency-path: apps/web/package-lock.json

      - run: npm ci
      - run: npx tsc --noEmit
      # ESLint (uncomment when config is fixed)
      # - run: npx eslint .

  web-test:
    name: "Web: unit tests"
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"
          cache-dependency-path: apps/web/package-lock.json

      - run: npm ci
      - run: npx vitest run

  # ════════════════════════════════════════════════════════════
  #  Docker build (validates Dockerfiles work)
  # ════════════════════════════════════════════════════════════
  docker-build:
    name: "Docker: build images"
    runs-on: ubuntu-latest
    # Only build Docker on PRs to main (saves time on feature branches)
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - name: Build API image
        run: docker build -t homegame-api:ci apps/api

      - name: Build Web image
        run: docker build -t homegame-web:ci apps/web
```

### How it works:

```
Push to PR
  ├── api-check      (cargo check + clippy)     ~2 min
  ├── api-test       (cargo test + Postgres)     ~3 min
  ├── web-check      (tsc + eslint)              ~1 min
  ├── web-test       (vitest)                    ~1 min
  └── docker-build   (build both images)         ~5 min
                                          Total: ~5 min (parallel)
```

All jobs run **in parallel**. The whole pipeline takes ~5 minutes because
the slowest job (Docker build) is the bottleneck.

---

## 6. CD Pipeline for HomeGame

### `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]

# Only one deploy at a time
concurrency:
  group: deploy
  cancel-in-progress: false  # Don't cancel an active deployment!

jobs:
  deploy:
    name: "Deploy to production"
    runs-on: ubuntu-latest
    # Only deploy if CI passed (this workflow only runs on main,
    # and main requires PR checks to pass via branch protection)

    steps:
      - uses: actions/checkout@v4

      # ── Build and push Docker images ──────────────────────
      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: apps/api
          push: true
          tags: ghcr.io/${{ github.repository }}/api:latest

      - name: Build and push Web image
        uses: docker/build-push-action@v5
        with:
          context: apps/web
          push: true
          tags: ghcr.io/${{ github.repository }}/web:latest

      # ── Deploy to VPS via SSH ─────────────────────────────
      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/homegame
            docker compose pull
            docker compose up -d
            # Run migrations
            docker compose exec -T api sqlx migrate run
            # Health check
            sleep 5
            curl -f http://localhost:8080/auth/login || exit 1
            echo "Deploy successful!"
```

### Secrets you need to add in GitHub → Settings → Secrets:

| Secret | Value | Example |
|--------|-------|---------|
| `SERVER_HOST` | Your VPS IP or domain | `142.93.12.34` |
| `SERVER_USER` | SSH username | `deploy` |
| `SSH_PRIVATE_KEY` | SSH private key (ed25519) | `-----BEGIN OPENSSH...` |

---

## 7. Docker Setup

### `apps/api/Dockerfile`

```dockerfile
# ── Build stage ──────────────────────────────────────────────
FROM rust:1.85-slim AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
# Cache dependencies by building with a dummy main
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

COPY . .
# Touch main.rs so cargo knows to rebuild it (not the cached dummy)
RUN touch src/main.rs && cargo build --release

# ── Runtime stage (tiny image, no compiler) ──────────────────
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/api /usr/local/bin/api
COPY --from=builder /app/migrations /app/migrations

WORKDIR /app
ENV RUST_LOG=info
EXPOSE 8080
CMD ["api"]
```

### `apps/web/Dockerfile`

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```

### `infra/docker-compose.yml` (development)

```yaml
version: "3.9"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: homegame_user
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: homegame
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### `infra/docker-compose.prod.yml`

```yaml
version: "3.9"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: homegame
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  api:
    image: ghcr.io/YOUR_USER/homegamenext/api:latest
    environment:
      DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@db:5432/homegame
      JWT_SECRET: ${JWT_SECRET}
      PORT: "8080"
    depends_on:
      - db
    restart: unless-stopped

  web:
    image: ghcr.io/YOUR_USER/homegamenext/web:latest
    environment:
      API_URL: http://api:8080
    ports:
      - "3000:3000"
    depends_on:
      - api
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - web
    restart: unless-stopped

volumes:
  pgdata:
```

---

## 8. Common Patterns and Tips

### 8.1 Branch protection

Go to GitHub → Settings → Branches → Add rule for `main`:
- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass (select: `api-check`, `api-test`, `web-check`, `web-test`)
- ✅ Require branches to be up to date before merging

This ensures **nothing merges to main unless tests pass**.

### 8.2 Caching

The CI config above uses caches to speed up builds:

| Cache | What it saves | Time saved |
|-------|--------------|------------|
| `Swatinem/rust-cache` | Cargo registry + compiled deps | ~2 min |
| `actions/setup-node` with `cache: "npm"` | node_modules | ~30s |
| Docker layer cache | Built layers | ~3 min |

### 8.3 When tests are slow

```
Problem: cargo test takes 5 minutes
Fix:     cargo test --workspace --jobs 4     (parallel test threads)

Problem: npm test takes 3 minutes
Fix:     vitest run --reporter=dot            (less output overhead)

Problem: Docker build takes 10 minutes
Fix:     Use BuildKit cache mounts + multi-stage builds (shown above)
```

### 8.4 Flaky tests

A flaky test is one that sometimes passes, sometimes fails. Seniors treat
these as **urgent bugs**. Common causes:

| Cause | Fix |
|-------|-----|
| Tests share a database | Give each test its own DB |
| Tests depend on ordering | Make each test independent |
| Time-dependent logic | Mock `Utc::now()` / `Date.now()` |
| Race conditions in async code | Use `tokio::time::timeout` |

### 8.5 The "test on save" workflow

During development, seniors run tests continuously:

```bash
# Rust — rerun tests on every file change
cargo watch -x test

# Frontend — vitest watch mode
npx vitest
```

This gives you **instant feedback** — you know within seconds if your change
broke something.

---

## 9. Security

### Never put these in CI/CD configs:

- Database passwords (use GitHub Secrets → `${{ secrets.DB_PASSWORD }}`)
- JWT secrets (use GitHub Secrets)
- SSH keys (use GitHub Secrets)
- API keys (use GitHub Secrets)

### The `.env` file:

- **Never commit `.env` to git** (add to `.gitignore`)
- CI uses `env:` blocks in the workflow YAML
- Production uses Docker environment variables or a secrets manager

### Docker security:

- Use specific image tags (`postgres:16`) not `latest`
- Run as non-root user in production containers
- Don't `COPY . .` before `npm ci` (leaks .env if it exists)

---

## 10. Cost

| Service | Free tier | Enough for HomeGame? |
|---------|-----------|---------------------|
| **GitHub Actions** | 2,000 min/month (private) | Yes — ~5 min × 20 PRs = 100 min |
| **GitHub Container Registry** | Unlimited for public repos | Yes |
| **Docker Hub** | 1 private repo free | Alternative to GHCR |
| **VPS (Hetzner/DigitalOcean)** | ~$5/month | Cheapest production option |
| **Let's Encrypt** | Free SSL | Always use this |

**Total cost for a production HomeGame deployment: ~$5/month** (just the VPS).

---

## Quick Start Checklist

When you're ready to set up CI/CD:

```
□ 1. Write at least 3 integration tests for the Rust API
       (auth flow, create game, submit scores)
□ 2. Write at least 2 component tests for the frontend
       (AddPlayerForm, RoundForm)
□ 3. Copy .github/workflows/ci.yml from this guide
□ 4. Push to a PR and watch it run
□ 5. Fix whatever breaks (there's always something)
□ 6. Enable branch protection on main
□ 7. Write the Dockerfiles
□ 8. Copy .github/workflows/deploy.yml
□ 9. Set up GitHub Secrets for your VPS
□ 10. Deploy!
```

**Start with CI (steps 1-6). Add CD later (steps 7-10).**

Don't try to do everything at once. A working CI pipeline with 5 tests is
infinitely more valuable than a perfect pipeline with 0 tests.
