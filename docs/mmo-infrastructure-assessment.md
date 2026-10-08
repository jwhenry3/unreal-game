# MMORPG Infrastructure Assessment

> Last verified: 2026-10-08 — editor launched (UE 5.7.4), `Lvl_MmoLogin` loaded, MCP bridge live.

## Headline

This project is a **single-player client + REST persistence backend** with MMO-shaped
UI. There is no game server and no multiplayer code at all: zero `bReplicates`,
zero RPCs, no `GetLifetimeReplicatedProps`, no OnlineSubsystem, no server build
target. After login the client just `OpenLevel`s locally to `PostLoginMap`.

## What exists today

### Client (UE 5.7, `Source/MyGame/`)

- `Variant_MMO/MMOGameInstance` — owns WebHUD + login; HTTP `POST /auth/login`,
  `GET /auth/servers`; stores `AccessToken`/`RefreshToken` in memory; dev-login
  fallback; `OpenLevel(PostLoginMap)` on success.
- `Variant_MMO/MMOLoginGameMode` + `MMOLoginPlayerController` — UI-only input on
  `Content/MMO/Lvl_MmoLogin.umap` (3 actors: camera, directional light,
  sky atmosphere; World Partition off).
- `Variant_MMO/UI/` — CEF WebBrowser widget, `MMOHudBridge` (`ue.hud` JS bridge),
  `MMOWebHud` (persistent viewport widget, viewport "holes" for 3D, RMB orbit
  input processor).
- `Variant_Combat/` — single-player melee combat template (character, AI
  controller, StateTree utility, damageable interfaces, anim notifies).
- `Variant_Platforming/`, `Variant_SideScrolling/` — unrelated template content.
- Build deps: Json/JsonUtilities/HTTP only. **No networking modules beyond
  default Engine replication that nothing uses.**

### UI (`ui/`)

- React+Vite HUD, single bundle `Content/WebUI/index.html`. Login screen wired
  to real auth. In-game HUD is **all mock data**: party list, chat, hotbars,
  quest tracker, target frame, character window, 3D paperdoll viewport.

### Backend (`backend/`, NestJS + SQLite/TypeORM)

Production-shaped REST API, well documented in `backend/README.md`:

- Auth: register/login/refresh/logout, JWT + rotating opaque refresh tokens,
  bcrypt, rate limits, helmet, dev-only JWT fallback.
- Characters: CRUD, realm, main/sub job with per-job progress rows, currency,
  map+position, arbitrary `state` JSON, soft delete, `/enter`.
- Inventory: items with container/slot/durability/metadata/bound flags;
  mutations internal-only.
- Mail: player + system mail, item/currency attachments, claim/expiry.
- Housing: realm-scoped plots, one house per character, furnishing consumes
  inventory items.
- Auction: bid/buyout/cancel, atomic debit+refund, expiry processing endpoint.
- Persistence: generic versioned K/V (`/internal/state/:scope/:scopeId/:key`)
  with optimistic concurrency — suitable for quest flags, world state.
- Domain events: `/internal/events` with idempotency keys.
- `x-service-key` internal API; `npm run smoke` covers the surface.

## The gaps, by phase

### Phase 0 — hygiene (small, do first)

- **No git repo.** Entire project unversioned (incl. backend, ui). Init repo +
  .gitignore (Binaries, Intermediate, DerivedDataCache, Saved, node_modules,
  backend/data) before anything else.
- **Port conflict (live issue):** McpAutomationBridge plugin inside the editor
  listens on **:3000** (its native MCP HTTP surface; `/mcp` wants SSE).
  Backend default `PORT=3000` and `AuthBaseUrl=http://localhost:3000` collide —
  login will hit the MCP endpoint and 404 while the editor is open. Move backend
  to 3100 (README smoke test already does) or remap the MCP port.
- **No `.env`** in backend — copy `.env.example`, set secrets.
- **Stale docs:** `content-authoring.md` references `TypeScript/src/...` and
  `GameData/` — neither directory exists. Content Studio pipeline is absent
  from the tree; doc is describing removed/not-yet-restored work.

### Phase 1 — first networked vertical slice (the big lift)

Everything here is greenfield C++ work:

1. **Dedicated server build**: add `MyGameServer.Target.cs`, server uproject
   target, `ServerDefaultMap`, cook/pak server content pipeline. Nothing exists
   today.
2. **Replication**: enable on `MyGameCharacter`/`CombatCharacter` (movement is
   free via `CharacterMovementComponent`), then replicate health/stats. Need
   `NetMode` guards everywhere — all existing code assumes single-player.
3. **Connect flow**: after login, client must `ClientTravel` to a game server
   address (from `/auth/servers` — currently just names, no endpoints) with
   the token in travel options; server GameMode validates the JWT on
   `PreLogin`/`GameSession` (verify against backend or shared-secret HS256).
4. **Character select**: backend `/characters` CRUD exists; client has no
   screen — add React character-select phase between login and travel, pass
   `characterId` to server.
5. **Backend service client in UE**: a GameInstanceSubsystem making
   authenticated HTTP calls (JWT on player calls, `x-service-key` on server
   calls) — save position/state on logout + heartbeat via
   `/internal/characters/:id/state`.
6. **Spawn from persisted state**: server loads character row (map/position/
   jobs) on join.

Deliverable shape: two packaged clients connect to a local dedicated server,
see each other move, log out, and position persists via the backend.

### Phase 2 — game systems on the wire

- **Combat authority**: `Variant_Combat` is client-side single-player. Either
  adopt GAS (GameplayAbilities plugin not enabled) or hand-roll replicated
  damage/cooldowns. GAS is the better long-term bet for an MMO.
- **Chat**: HUD is mock; backend has no chat/presence — needs a realtime
  channel (WebSocket gateway on NestJS, or route through the game server via
  replicated events for say/local and backend WS for guild/whisper).
- **Party/group/interest**: no data model on backend yet (no groups/guild
  entities), no client UI wiring.
- **Inventory/economy in-game**: backend is complete but has zero UE callers.
  Server-side `UGameplaySubsystem` that proxies to `/internal/inventory` etc.,
  plus push of HUD updates through `ueDispatch`.
- **Quests/NPCs**: generic state K/V can hold quest progress; needs a quest
  runtime (def loading, objective tracking) — no data pipeline exists
  (see Content below).

### Phase 3 — MMO-scale infrastructure

- **World design**: decide zone model — World Partition streaming (single big
  map, server-mesh handoff is hard in stock UE) vs. per-zone dedicated servers
  with `ServerTravel` handoff. The latter is the pragmatic path for a small
  team.
- **Realm routing**: `GAME_SERVERS` env is a name list — needs
  `{name, host, port, map}` records and a directory/login-queue service.
- **Realtime service**: WS gateway for chat, presence, mail/auction
  notifications, domain events → client push.
- **Scale storage**: SQLite → Postgres; add Redis only when session/presence
  caching demands it.
- **Content pipeline**: the GameData JSON schema from docs (races, items,
  skills, recipes, quests, npcs, shops) needs a runtime loader subsystem +
  validation, and the editor tooling needs to be rebuilt or the doc revived.
- **Ops**: server packaging CI, headless server run scripts, logging/metrics,
  crash reporting; deploy story (containers, process manager).
- **Anti-cheat posture**: server authority for movement validation, item
  grants (backend already internal-only — good), rate limiting per player.

## Rough sizing

| Area | Exists | Effort to first usable |
|---|---|---|
| Auth + realm select | Yes (backend + client) | done; fix port conflict |
| Character CRUD | Backend only | S–M (React screen + calls) |
| Dedicated server | Nothing | M (target + config + cook) |
| Replication | Nothing | M (character/props/combat) |
| Server connect + token handshake | Nothing | M (travel options + PreLogin verify) |
| Save/load state | Backend API only | S–M (subsystem + hooks) |
| Inventory/mail/auction/housing | Backend API only | M each (server proxy + HUD wiring) |
| Chat/presence/party | Mock UI only | M–L (WS service + server relay) |
| Combat (authoritative) | Single-player only | L (GAS or custom + replication) |
| World/zone instancing | Nothing | L (architecture decision + travel) |
| Content pipeline | Doc only, code absent | M–L |
| Ops/deploy | Nothing | M–L |

## Progress log

### 2026-10-08

- **Phase 0 done:**
  - `.gitignore` added for Unreal/Node/backend artifacts.
  - Port collision fixed: backend/client now default to `3100`; `.env.example`
    and `.env.sample` updated; backend README updated.
  - Stale `content-authoring.md` marked as archived; `docs/README.md` updated.
- **Phase 1 started:**
  - `Source/MyGameServer.Target.cs` created.
  - Backend `POST /internal/auth/verify` added (service-key guarded) so game
    servers can validate an access token without sharing the JWT secret.
  - `AMMOGameMode` added with async token verification against
    `POST /internal/auth/verify`.
  - `MMOGameInstance` now `ClientTravel`s to a configurable game server with
    the access token in URL options instead of just `OpenLevel`ing locally.
    If the backend is unreachable and `bAllowDevelopmentLogin` is true, it falls
    back to dev login so PIE/standalone iteration still works.
  - `DefaultEngine.ini` `ServerDefaultMap` set to `Lvl_ThirdPerson`;
    `DefaultGame.ini` wires `AuthBaseUrl`, `DefaultGameServerAddress`, and
    `MMOGameMode` config (backend URL, service key, pawn class path).
  - `AMyGameCharacter` now explicitly enables replication and CMC replication.
  - Added a React account-registration screen; `MMOGameInstance` sends
    `POST /auth/register` and logs the new account straight into character select.
  - Added a React create-character form inside character select;
    `MMOGameInstance` sends `POST /characters` and refreshes the list.
  - Added a self-host PIE mode: `MMOGameInstance` calls
    `AMMOGameMode::EnterGame`, which promotes the persistent login world to a
    listen server (`UWorld::Listen`) and streams `PostLoginMap` in additively
    instead of traveling. `MMOGameMode` can allow PIE/standalone connections
    without a backend token for local development.
  - Added additive scene streaming to `MMOGameMode`:
    `DefaultAdditiveLevels` streams configured sub-levels in on server start.
    A new `Lvl_AdditiveHub` was created as the first additive scene.
    PIE debugging note: `ULevelStreamingDynamic::LoadLevelInstance` creates
    runtime `UEDPIE_*_LevelInstance_*` levels, not authored editor sublevels,
    so they do not appear in the editor world's Levels panel. Use the
    Outliner's world selector (`Settings -> Choose World -> Auto`/the PIE
    world) to inspect their runtime actors.
  - Fixed a missing include in `MMOWebHud.cpp` (`UWidgetTree`) that prevented
    a clean client build.
  - Fixed PIE self-host kicking back to the login map: `AMMOGameMode::PostLogin`
    required a `PendingAuths` entry, but `PreLogin` only runs for remote net
    connections — never for a listen server's local host player. Gotcha worth
    remembering: on a listen server, `PostLogin` runs for the host without
    `PreLogin`.
  - **Persistent-level login flow:** self-host no longer `OpenLevel`s the play
    map. `Lvl_MmoLogin` is now the session's persistent world; `MMOLoginGameMode`
    derives from `AMMOGameMode` and keeps players spectating
    (`bWaitForEnterGame`) until `AMMOGameMode::EnterGame` promotes the world to
    a listen server (`UWorld::Listen`), streams `PostLoginMap` in via
    `ULevelStreamingDynamic`, verifies the token, and `RestartPlayer`s the
    player. The web HUD/CEF browser is never torn down, which also fixed the
    "no bridge" reload. Remote clients that verify before the host enters are
    queued and spawned when the game level loads. Login-map cosmetic actors
    (camera, directional light, sky atmosphere) are tagged `LoginBackdrop` and
    destroyed on enter. Auth failures after login call
    `UMMOGameInstance::ReturnToLogin` instead of map travel so the HUD survives.
    `UMMOWebBrowser` now resets its bind flag in `ReleaseSlateResources` so the
    HUD re-binds `ue.hud` if the slate browser is ever rebuilt anyway.
  - Added a separate in-house observability app with authenticated event ingestion,
    SQLite retention, live SSE dashboard, allowlisted log/file watching, and
    non-blocking NestJS request/domain-event instrumentation.
  - Backend compiles and smoke tests pass against port `3100`.
  - **Blocker found:** Epic Games Launcher binary distribution of UE 5.7 does
    **not** allow building `TargetType.Server` targets (`Server targets are not
    currently supported from this engine distribution`). For a true dedicated
    server you need a source-built engine or a different distribution.
    For Phase 1 we can still prove the netcode with a **listen server** using the
    client executable (`MyGame.exe /Game/ThirdPerson/Lvl_ThirdPerson?Listen`).

## Suggested sequence

1. Phase 0 hygiene (repo, ports, .env) — done.
2. Character select screen, token travel, and trivial replication in listen-server
   PIE / standalone. The handshake path compiles and backend smoke tests pass;
   live end-to-end needs backend running.
3. Server-side spawn/save via `/internal/characters/:id/state`.
4. Decide on engine distribution for dedicated servers (source build) before
   moving to production-scale ops.
5. Then pick one economy feature (inventory is deepest already) end-to-end to
   prove the server↔backend pattern, and one social feature (chat) end-to-end
   to prove the realtime pattern.

The backend is the strongest asset here — the UE side is the long pole: all of
netcode, server authority, and the service-client layer is unbuilt.
