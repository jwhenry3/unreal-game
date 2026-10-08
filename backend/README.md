# MyGame Backend

NestJS + SQLite backend for the Unreal MMO prototype. The service provides account authentication plus persistent game-domain storage that can be offloaded from authoritative game servers: characters, inventory, mail, housing, auctions, generic state, and domain events.

## Requirements

- Node.js 22 or newer
- npm 10 or newer

## Setup

```powershell
cd backend
npm install
copy .env.example .env
```

Edit `.env` and replace `JWT_SECRET` and `INTERNAL_API_KEYS` with long random values. The app uses a development JWT fallback only when `NODE_ENV` is not `production`; production startup fails without `JWT_SECRET`.

Start the service:

```powershell
npm run start:dev
```

Build and run the compiled app:

```powershell
npm run build
npm run start:prod
```

The SQLite database defaults to `backend/data/auth.sqlite`. The directory is created automatically and migrations run at startup.

> Note: the default port is `3100`, not `3000`, because the Unreal Editor MCP bridge listens on `localhost:3000`.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Runtime environment. |
| `PORT` | `3100` | HTTP listen port. (Default moved from 3000 because the Unreal Editor MCP plugin occupies :3000.) |
| `DATABASE_PATH` | `./data/auth.sqlite` | SQLite database path, relative to `backend/` unless absolute. |
| `JWT_SECRET` | development fallback | Required in production. |
| `JWT_ACCESS_TTL_SECONDS` | `900` | Access-token lifetime. |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` | Refresh-token lifetime. |
| `REMEMBER_ME_REFRESH_TTL_SECONDS` | `7776000` | Remember-me refresh lifetime. |
| `GAME_SERVERS` | `Local` | Comma-separated realm list returned by `/auth/servers`. |
| `INTERNAL_API_KEYS` | none | Comma-separated trusted game-server keys for `/internal/*`. |
| `MAX_CHARACTERS_PER_ACCOUNT` | `8` | Character creation limit. |
| `MAIL_TTL_HOURS` | `720` | Default mail expiration. |
| `CORS_ORIGIN` | disabled | Browser origin allowlist. Unreal server-to-server calls do not need CORS. |
| `DB_LOGGING` | `false` | Enables TypeORM SQL logging. Do not enable in production logs containing sensitive payloads. |

## Authentication

### Player JWT authentication

Player-facing routes use:

```text
Authorization: Bearer <accessToken>
```

Character-scoped endpoints verify that the character belongs to the authenticated account. A request for another account's character returns `404` rather than exposing whether that character exists.

### Internal service authentication

Trusted game-server routes use:

```text
x-service-key: <key from INTERNAL_API_KEYS>
```

The service key is compared with a timing-safe check and is separate from player JWTs. Do not ship the key in a game client; configure it only on trusted game servers or backend workers.

## Auth API

### `GET /health`

Returns service health.

### `GET /auth/servers`

```json
{ "servers": ["North America", "Europe"] }
```

### `POST /auth/register`

```json
{
  "username": "player_one",
  "email": "player@example.com",
  "password": "Password123!"
}
```

Creates the account and returns access/refresh tokens. Duplicate usernames or emails return `409`.

### `POST /auth/login`

```json
{
  "username": "player_one",
  "password": "Password123!",
  "serverName": "North America",
  "rememberMe": true
}
```

Returns:

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<opaque refresh token>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshExpiresIn": 7776000,
  "user": {
    "id": "<uuid>",
    "username": "player_one",
    "email": "player@example.com",
    "displayName": "player_one"
  }
}
```

### Other auth routes

- `POST /auth/refresh` rotates an opaque refresh token.
- `GET /auth/me` returns the authenticated account/session.
- `POST /auth/logout` revokes the current or supplied refresh session.

## Player domain API

### Characters

- `GET /characters` — list the account's active characters.
- `POST /characters` — create `{ name, realm, job?, subJob? }`.
- `GET /characters/:characterId` — fetch an owned character.
- `POST /characters/:characterId/enter` — mark the character as played.
- `DELETE /characters/:characterId` — soft-delete an owned character.

Characters store realm, active `mainJob`/`subJob`, currency, map, position, arbitrary state, deletion status, and timestamps. Level and experience live in `jobProgress` rows keyed by job, so progress persists independently for every job the character has unlocked.

### Inventory

- `GET /characters/:characterId/inventory`
- `GET /characters/:characterId/inventory?container=inventory`

Inventory mutation is intentionally internal-only so a client cannot mint or rewrite items. Items are reserved while attached to mail, placed in housing, or listed on the auction house.

### Mail

- `GET /characters/:characterId/mail?box=inbox|sent`
- `POST /characters/:characterId/mail`
- `GET /characters/:characterId/mail/:mailId`
- `POST /characters/:characterId/mail/:mailId/read`
- `POST /characters/:characterId/mail/:mailId/claim`
- `DELETE /characters/:characterId/mail/:mailId`

Player mail accepts `recipientCharacterId` or `recipientName`/`recipientRealm`, plus optional inventory item attachments:

```json
{
  "recipientCharacterId": "<recipient character uuid>",
  "subject": "Trade",
  "body": "Here is the item.",
  "attachments": [{ "inventoryItemId": "<owned inventory item uuid>" }]
}
```

Attached items must belong to the sender, be in the normal `inventory` container, and not be bound. They are moved to the `mail` container until claimed. Unclaimed reserved items return to the sender if the mail is deleted.

### Housing

Public reads:

- `GET /housing/plots?realm=North%20America`
- `GET /housing/houses?realm=North%20America`

Player routes:

- `POST /characters/:characterId/house/claim/:plotId`
- `GET /characters/:characterId/house`
- `PATCH /characters/:characterId/house`
- `DELETE /characters/:characterId/house`
- `POST /characters/:characterId/house/furnishings`
- `DELETE /characters/:characterId/house/furnishings/:furnishingId`

Plots are created by the trusted internal API. A character can claim one plot on its own realm and may own one house. Furnishing placement consumes a real inventory item:

```json
{
  "inventoryItemId": "<owned inventory item uuid>",
  "transform": { "x": 10, "y": 20, "z": 0, "yaw": 90 },
  "metadata": { "variant": "oak" }
}
```

Removing a furnishing or releasing a house returns reserved items to the owner's inventory.

### Auction house

Public reads:

- `GET /auction/listings?realm=North%20America&itemKey=sword`
- `GET /auction/listings/:listingId`

Player routes:

- `GET /characters/:characterId/auction/listings`
- `POST /characters/:characterId/auction/listings`
- `POST /characters/:characterId/auction/listings/:listingId/bid`
- `POST /characters/:characterId/auction/listings/:listingId/buyout`
- `POST /characters/:characterId/auction/listings/:listingId/cancel`

Create listing:

```json
{
  "inventoryItemId": "<owned inventory item uuid>",
  "startingBid": 100,
  "buyoutPrice": 300,
  "durationHours": 24
}
```

The item is moved to the `auction` container while listed. Bids atomically debit the bidder and refund the previous bidder. Sellers cannot bid on or buy their own listings. Cancellation refunds the active bidder and returns the item. Expired listings either sell to the highest bidder or return to the seller.

## Internal game-server API

All routes below require `x-service-key`.

### Character persistence

- `GET /internal/characters/:characterId`
- `PATCH /internal/characters/:characterId/state`
- `POST /internal/characters/:characterId/currency`
- `GET /internal/characters/:characterId/jobs`
- `PUT /internal/characters/:characterId/jobs/:jobKey`
- `PATCH /internal/characters/:characterId/jobs`

State update example:

```json
{
  "mapName": "Lvl_ThirdPerson",
  "position": { "x": 100, "y": 40, "z": 12 },
  "state": { "questFlags": ["intro-complete"] }
}
```

Update progression for a job:

```json
PUT /internal/characters/<id>/jobs/warrior
{
  "level": 12,
  "experience": 4500,
  "isUnlocked": true
}
```

Switch the active job combination:

```json
PATCH /internal/characters/<id>/jobs
{
  "mainJob": "Monk",
  "subJob": "Ranger"
}
```

`subJob` can be set to `null` to clear it. Main and sub job must differ. Switching to an unlocked or new job creates a level-1 progression row when needed.

Currency grants accept positive or negative integer amounts; the result cannot become negative.

### Inventory persistence

- `GET /internal/characters/:characterId/inventory`
- `POST /internal/characters/:characterId/inventory/items`
- `PATCH /internal/characters/:characterId/inventory/items/:itemId`
- `DELETE /internal/characters/:characterId/inventory/items/:itemId`

Add item example:

```json
{
  "itemKey": "iron_sword",
  "quantity": 1,
  "container": "inventory",
  "slotIndex": 4,
  "durability": 100,
  "metadata": { "rarity": "rare" },
  "isBound": false
}
```

### System mail

`POST /internal/mail` can send system mail or mail between known character ids:

```json
{
  "recipientCharacterId": "<uuid>",
  "senderCharacterId": "<optional uuid>",
  "subject": "Reward",
  "body": "Thanks for playing.",
  "attachments": [
    { "type": "currency", "currency": 50 },
    { "type": "item", "itemKey": "health_potion", "quantity": 3 }
  ]
}
```

Internal item attachments mint a stored item record when claimed; currency attachments credit the character.

### Housing setup

`POST /internal/housing/plots` creates claimable plots:

```json
{
  "realm": "North America",
  "district": "Harbor",
  "plotKey": "harbor-001",
  "sizeTier": "standard"
}
```

### Auction maintenance

`POST /internal/auctions/process-expired` scans expired active listings. A scheduled worker or game server should call it periodically.

### Generic persisted state

Use this to move transient authoritative-server state into durable storage:

- `GET /internal/state/:scope/:scopeId`
- `GET /internal/state/:scope/:scopeId/:key`
- `PUT /internal/state/:scope/:scopeId/:key`
- `POST /internal/state/:scope/:scopeId/batch`
- `DELETE /internal/state/:scope/:scopeId/:key`

`scope`, `scopeId`, and `key` form a unique coordinate. Example scopes include `character`, `account`, `guild`, `quest`, or `world`. Values are JSON-compatible.

Single write with optimistic concurrency:

```json
{
  "value": { "step": 2, "objectives": ["talk-to-npc"] },
  "expectedVersion": 1
}
```

Use `expectedVersion: 0` to require creation, or omit it for upsert. A stale version returns `409`.

Batch write:

```json
{
  "entries": [
    { "key": "position", "value": { "x": 1, "y": 2 } },
    { "key": "settings", "value": { "uiScale": 1 } }
  ]
}
```

Batch writes are transactional; a version conflict rolls back the batch.

### Domain events

- `GET /internal/events?unprocessed=true|false`
- `POST /internal/events`
- `POST /internal/events/:eventId/processed`

Emit event:

```json
{
  "type": "character.progress.saved",
  "aggregateType": "character",
  "aggregateId": "<character uuid>",
  "payload": { "level": 12 },
  "idempotencyKey": "game-server-save-123"
}
```

An existing idempotency key returns the original event instead of creating a duplicate.

## Verification

```powershell
npm install
npm run build
npm run typecheck
npm audit --omit=dev
```

With the service running on port `3100` and a development service key:

```powershell
$env:BASE_URL='http://localhost:3100'
$env:INTERNAL_API_KEY='local-development-key'
npm run smoke
```

The smoke test covers clean migration state, auth registration, ownership rejection, job/subjob progression and switching, internal character/inventory writes, auctions, mail, housing, generic state, event idempotency, and service-key rejection.

## Unreal integration

`AMMOLoginPlayerController` emits `OnAuthenticationRequested` with `Username`, `Password`, `ServerName`, and `bRememberMe`. An Unreal HTTP implementation should:

1. POST JSON to `http://127.0.0.1:3100/auth/login` during local development.
2. Map the delegate values to `username`, `password`, `serverName`, and `rememberMe`.
3. Treat HTTP `200` with an `accessToken` as success and call `CompleteLogin(true, FText::GetEmpty())`.
4. Call `CompleteLogin(false, FailureMessage)` for non-`200` or transport failures.
5. Keep the access token in memory and persist the refresh token only when remember-me is enabled.
6. Keep `bAllowDevelopmentLogin` disabled when testing this backend.

The game server, not the public game client, should call `/internal/*` over a private network or localhost. Do not log passwords, JWTs, refresh tokens, or service keys.

## Security notes

- Passwords use bcrypt.
- SQLite stores SHA-256 refresh-token hashes, never raw refresh tokens.
- Refresh tokens rotate and revoked sessions invalidate JWT access.
- Login, registration, and refresh are rate-limited.
- Validation uses a strict whitelist pipe.
- Helmet headers are enabled.
- Internal APIs fail closed when `INTERNAL_API_KEYS` is empty.
- Use HTTPS and private networking outside local development.
- SQLite is suitable for development and small deployments; migrate these module boundaries to PostgreSQL/MySQL for concurrent production load.
