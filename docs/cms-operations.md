# CMS and Operations Console

> Last verified: 2026-10-08

The local application in `observability/` is now split into two product areas that share one shell:

- **CMS** at `/cms` manages blog posts, game updates, account administration, and community items.
- **Observability** at `/observability` keeps the existing backend health, architecture, route, log-tail, and event-stream views.

The process remains separate from the NestJS backend so monitoring stays available when the backend is down.

## Boundaries

- `observability/src/server.ts` owns telemetry collection, log watching, SSE, static hosting, and request routing.
- `observability/src/cms.ts` owns CMS persistence and CMS request handling.
- `observability/web/cms.tsx` contains the CMS screens.
- `observability/web/observability.tsx` contains the health and diagnostics screens.
- `observability/web/shared.tsx` contains shared UI/fetch/stream helpers.

CMS data is stored in `observability/data/cms.sqlite`, configured with `CMS_DATABASE_PATH`. It does not read or write the backend's game/auth SQLite database.

## CMS routes

- `/cms` — newest-first combined post/update feed plus an account, account-server, and realm side panel
- `/cms/posts` — blog post list; `/cms/posts/new` and `/cms/posts/:id/edit` are dedicated editor routes
- `/cms/updates` — update/release list; `/cms/updates/new` and `/cms/updates/:id/edit` are dedicated editor routes with version and channel fields
- `/cms/accounts` — account search plus enable/disable actions
- `/cms/community` — community list; `/cms/community/new` and `/cms/community/:id/edit` are dedicated moderation routes

## CMS APIs

- `GET /v1/cms/overview`
- `GET /v1/cms/status`
- `POST /v1/cms/auth/login`
- `POST /v1/cms/auth/register`
- `POST /v1/cms/auth/refresh`
- `GET /v1/cms/auth/me`
- `POST /v1/cms/auth/logout`
- `GET|POST /v1/cms/content?type=post|update`
- `GET|PATCH|DELETE /v1/cms/content/:id`
- `GET|POST /v1/cms/community`
- `GET|PATCH|DELETE /v1/cms/community/:id`
- `GET /v1/cms/accounts?search=...`
- `PATCH /v1/cms/accounts/:id`

CMS writes are also emitted into the telemetry stream as `kind: "cms"` events so content and moderation actions can be inspected in Observability.

## Account management

The CMS calls the NestJS service-key-protected internal API rather than touching account tables:

- `GET /internal/accounts?search=...`
- `PATCH /internal/accounts/:accountId`

Supported account updates are display name, email, and `isActive`. Disabling an account makes existing sessions unusable because authentication still checks `user.isActive` during token/session validation.

Configure the CMS proxy with:

```text
CMS_BACKEND_URL=http://127.0.0.1:3100
CMS_BACKEND_SERVICE_KEY=local-development-service-key
```

Use a non-development service key outside local development.

The overview side panel proxies the backend's public auth endpoints. Browser-side access and refresh tokens are stored in `localStorage` for the local MVP; replace this with an HTTP-only session cookie before exposing the console beyond loopback.

## Security notes

This is still a trusted-local MVP. The dashboard binds to loopback by default but CMS writes are not authenticated. Add a dashboard/admin authentication boundary before exposing the app on a LAN or remote host.
