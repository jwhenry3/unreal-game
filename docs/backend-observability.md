# Backend Observability

> Last verified: 2026-10-08

MyGame uses an in-house local observability application in `observability/`. It runs separately from the NestJS backend so request failures and backend downtime do not take the dashboard down with the monitored process.

## Architecture

- `observability/src/server.ts` provides an authenticated event ingestion endpoint, SQLite-backed retention, filtered query APIs, Server-Sent Events, and an allowlisted file watcher.
- `observability/src/cms.ts` provides the separate CMS data plane; the React shell exposes it as a distinct `/cms` area.
- `backend/src/observability/` batches request and domain-event telemetry to the collector. Delivery is non-blocking, bounded to 1,000 queued events, and disabled when collector configuration is absent.
- `BackendHealthService` sends a heartbeat every 10 seconds with database status and latency, process uptime, memory use, Node version, and telemetry queue depth.
- The dashboard is a React/Vite single-page application in `observability/web/`. Observability lives under `/observability` with routes for Health, Architecture, Routes, Logs, and Events. Health includes a live heartbeat pulse plus 30-minute database latency, memory, request-volume, and average-latency charts.
- The collector uses Node's built-in `node:sqlite`; Node 22.5 or newer is required.

## Run locally

```text
cd observability
copy .env.example .env
npm install
npm run build
npm start
```

`npm run build` compiles both the collector and the React dashboard. For frontend development with API proxying and hot reload, run the collector separately and use `npm run start:dev`.

Open `http://127.0.0.1:4100/observability` for monitoring or `/cms` for the CMS. Configure the backend with matching values:

```text
OBSERVABILITY_URL=http://127.0.0.1:4100
OBSERVABILITY_API_KEY=local-observability-key
OBSERVABILITY_SERVICE=mygame-backend
```

## Event and file behavior

`POST /v1/events` accepts one event or a batch of up to 100 and requires `x-observability-key`. The dashboard and read APIs bind to loopback by default. Sensitive attribute keys such as tokens, passwords, cookies, and secrets are redacted before persistence. Request instrumentation records method, route, status, duration, and error class, never request or response bodies.

`OBSERVABILITY_WATCH_PATHS` is a semicolon-separated allowlist relative to `OBSERVABILITY_PROJECT_ROOT`. Paths outside that root are rejected. Non-log files emit metadata-only activity events and never file contents. `.log` files use a separate incremental tailer: only newly appended bytes are read, lines are redacted, and each file keeps a bounded in-memory ring buffer (500 lines by default via `OBSERVABILITY_LOG_TAIL_LINES`). Log lines are delivered through a dedicated SSE event and are not stored as activity events in SQLite. Backup log files are ignored. Defaults watch `backend/logs` and Unreal's `Saved/Logs`.

SQLite data is stored under `observability/data/` and retained for seven days by default. Both are configurable. Route-health calculations use a rolling 15-minute telemetry window; a backend is considered offline after 30 seconds without a heartbeat.

The backend `/health` endpoint performs a live `SELECT 1` database probe and returns the same process health fields used by the dashboard. Collector APIs `/v1/backend-health`, `/v1/metrics`, and `/v1/architecture` supply current health, 30-minute chart history, and the architecture view.

This MVP is intended for a trusted local machine; add dashboard authentication and TLS before binding beyond loopback.
