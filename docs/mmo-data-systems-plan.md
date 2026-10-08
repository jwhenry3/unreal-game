# MMO Data Systems Plan

> Last updated: 2026-10-08

This plan covers the backend + Unreal + React HUD work needed to turn the current login/character-select prototype into a real data-driven MMO foundation: jobs/subjobs, inventory, equipment/prop mounting, stats, actions, skills, and spells.

## Where we are today

- **Backend** already has solid persistence primitives:
  - Auth/accounts, refresh tokens, internal service-key API
  - `characters` table with `main_job`/`sub_job`, `jobProgress` table, `state` JSON
  - `inventory_items` table with containers/slots/metadata
  - Generic `persisted_states` key/value store with optimistic concurrency
  - Domain event outbox (`domain_events`)
  - Mail, housing, auction modules as reference implementations
  - All internal endpoints live under `/internal/*` guarded by `x-service-key`
  - See subagent audit in this repo for full endpoint inventory.

- **Unreal** has:
  - `MMOGameInstance` with login/registration, token storage, character select
  - CEF/React HUD bridge (`MMOWebHud`/`MMOHudBridge`) with `ue.hud.notify` and `window.ueDispatch`
  - `MMOGameMode` with async JWT verification in `PreLogin`/`PostLogin`
  - `AMyGameCharacter` with replicated movement but no stats/abilities/inventory
  - A self-host listen-server mode and additive level streaming for PIE

- **UI** has:
  - Login, register, and character-select screens
  - A placeholder `HudView` that is entirely mock data
  - FFXIV-style CSS tokens/panels/slots ready for real windows

## Core principles

1. **Backend owns durable state.** Unreal dedicated/listen servers load it on join, mutate through internal APIs, and save on logout/checkpoints.
2. **Server-authoritative live state.** Stats, cooldowns, damage, and inventory changes run on the server and replicate to clients.
3. **HUD is a thin client.** The React page renders data pushed from the game and sends requests back; it never owns authoritative state.
4. **Reuse existing patterns.** Freeform `simple-json` columns, scoped key/value state, and domain events are the established escape hatches.

## Proposed data model

### 1. Stats

Option A (minimal): extend the existing `characters.state` JSON blob with a `stats` key.
Option B (preferred for MMO): add a first-class `character_stats` table.

```text
character_stats
  character_id FK → characters CASCADE
  stat_key       varchar(32)  -- hp, mp, str, dex, vit, int, mnd, crit, haste...
  base_value     int/real
  bonus_value    int/real     -- from gear/job/buffs
  current_value  int/real     -- for HP/MP/TP that change in combat
  updated_at     timestamp
  PK(character_id, stat_key)
```

Derived stats (attack power, defense, crit%) are computed server-side and cached in `characters.state` or another stats row. The Unreal server recomputes on equip/job/level changes and replicates the result.

### 2. Equipment

Add a dedicated `character_equipment` table rather than overloading the inventory container string.

```text
character_equipment
  character_id      FK → characters CASCADE
  slot_key          varchar(32)  -- main_hand, off_hand, head, body, hands, legs, feet, ears, neck, wrists, ring1, ring2...
  inventory_item_id FK → inventory_items SET NULL
  is_visible        bool
  updated_at        timestamp
  PK(character_id, slot_key)
```

- Equipping moves an item from `inventory` container to the equipment row (or duplicates it with a reference; never delete the inventory row until unequip/salvage).
- Visibility flags map to Unreal skeletal mesh sockets for showing/hiding gear.

### 3. Item definitions

Add an `item_definitions` catalog so the backend can validate equip slots, job requirements, and stats.

```text
item_definitions
  item_key     PK varchar(128)
  name         varchar(128)
  category     varchar(32)  -- weapon, armor, consumable, material, prop_mount
  equip_slot   varchar(32)  -- nullable, must match slot_key
  max_stack    int
  job_required varchar(64)  -- nullable
  min_level    int
  stats_bonus  json
  use_ability  varchar(64)  -- ability_key triggered by "Use" action
  metadata     json
```

This table is seeded by the game design team and referenced by `item_key`. The Unreal client needs a matching `UDataTable` or soft references for visuals.

### 4. Abilities, skills, and spells

Use a single `character_abilities` table that covers class skills, weapon skills, and spells.

```text
character_abilities
  character_id FK → characters CASCADE
  ability_key  varchar(64)
  rank         int default 1
  is_unlocked  bool
  source_job   varchar(64)  -- which job/skill tree granted it
  cooldown_at  timestamp nullable  -- optional server-side cooldown
  updated_at   timestamp
  PK(character_id, ability_key)
```

Skill trees/job progression are computed from `character_job_progress` plus a new `ability_definitions` table.

```text
ability_definitions
  ability_key  PK varchar(64)
  name         varchar(128)
  category     varchar(32)  -- spell, weapon_skill, job_ability, item_skill
  cast_time_ms int
  recast_ms    int
  mp_cost      int
  tp_cost      int
  range        real
  target_type  varchar(32)  -- self, friendly, enemy, aoe, party
  job_required varchar(64)  -- nullable
  min_job_level int
  effect_script varchar(64)  -- maps to a server-side effect/GAS gameplay cue
  metadata     json
```

### 5. Actions / hotbar

Persist the action bar as scoped key/value state:

```text
scope = "hotbar", scope_id = <character_id>, key = "slots"
value = {
  "slots": [
    { "slotId": 1, "type": "ability", "abilityKey": "fire" },
    { "slotId": 2, "type": "item",     "inventoryItemId": "uuid" },
    { "slotId": 3, "type": "macro",    "macroId": "..." }
  ]
}
```

This keeps hotbar layout durable across sessions without adding a new table.

### 6. Prop mounting

Re-use the housing-furnishing pattern at character scope.

```text
character_props
  id            UUID PK
  character_id  FK → characters CASCADE
  inventory_item_id FK → inventory_items SET NULL
  prop_key      varchar(128)
  transform     json  -- {location, rotation, scale}
  is_mounted    bool  -- active vs stored
  metadata      json
  created_at    timestamp
```

A mounted prop spawns an Unreal `AActor` attached to the character or placed in the world. Unmounting stores it back in inventory.

## Proposed backend API additions

All new endpoints live under `/internal/*` and reuse the existing `ServiceAuthGuard`.

| Endpoint | Purpose |
|---|---|
| `GET /internal/characters/:id/stats` | all stat rows for a character |
| `PATCH /internal/characters/:id/stats` | batch update base/current/bonus stats |
| `GET /internal/characters/:id/equipment` | equipped items by slot |
| `PUT /internal/characters/:id/equipment/:slot` | equip from inventory item UUID |
| `DELETE /internal/characters/:id/equipment/:slot` | unequip to inventory |
| `GET /internal/characters/:id/abilities` | unlocked abilities/ranks/cooldowns |
| `PUT /internal/characters/:id/abilities/:key` | unlock/rank-up an ability |
| `GET /internal/characters/:id/hotbar` | persisted action bar |
| `PUT /internal/characters/:id/hotbar` | save action bar layout |
| `GET /internal/characters/:id/props` | list stored/mounted props |
| `POST /internal/characters/:id/props` | mount a prop from inventory |
| `DELETE /internal/characters/:id/props/:propId` | unmount/store |
| `GET /internal/items/:itemKey` | item definition lookup |
| `POST /internal/items` | seed/update item definitions (admin) |
| `GET /internal/abilities/:abilityKey` | ability definition lookup |

Player-facing read-only endpoints (JWT) should mirror the internal ones where the HUD needs direct access:

- `GET /characters/:id/inventory` already exists.
- Add `GET /characters/:id/stats`, `/equipment`, `/abilities`, `/props`, `/hotbar` for the client HUD.

## Proposed Unreal architecture

### New / extended classes

1. **`AMMOPlayerState`** (new, replicated)
   - Holds `FMMOCharacterData` struct: stats, equipment, abilities, hotbar.
   - Replicates to owning client + spectators as needed.
   - Provides getters for `AMyGameCharacter` and the HUD.

2. **`AMyGameCharacter` extensions**
   - Read stats from `AMMOPlayerState` to set max HP/MP, movement speed, jump velocity.
   - Attach equipment meshes to skeletal sockets based on replicated equipment map.
   - Add RPCs for requesting actions (use ability, use item, equip, unequip, mount prop).

3. **`AMMOPlayerController`** (new)
   - Server RPCs:
     - `ServerUseAbility(FName AbilityKey, AActor* Target)`
     - `ServerUseItem(FGuid ItemId)`
     - `ServerEquipItem(FGuid ItemId, FName Slot)`
     - `ServerUnequipItem(FName Slot)`
     - `ServerMountProp(FGuid PropId)` / `ServerUnmountProp(FGuid PropId)`
   - Validation runs on server (cooldowns, range, MP/TP cost, inventory ownership).

4. **`AMMOGameMode` extensions**
   - In `OnVerifyTokenResponse`, after JWT verification, fetch:
     - `GET /internal/characters/:id`
     - `GET /internal/characters/:id/jobs`
     - `GET /internal/characters/:id/inventory`
     - `GET /internal/characters/:id/stats`
     - `GET /internal/characters/:id/equipment`
     - `GET /internal/characters/:id/abilities`
     - `GET /internal/characters/:id/hotbar`
   - Populate `AMMOPlayerState`.
   - On `Logout`/`EndPlay`, save dirty state back to backend via internal endpoints.
   - Add checkpoint save (e.g., on zone transition or periodic timer).

5. **`UMMOGameInstance` extensions**
   - After entering the game phase, subscribe to replicated `PlayerState` changes and push to the HUD via `SendToWeb`:
     - `player.state` — name, job, level, HP/MP/TP, position
     - `inventory` — container contents
     - `equipment` — slot map
     - `abilities` — unlocked abilities
     - `hotbar` — action slots
     - `jobs` — job progress
   - Handle new page events in `HandleHudEvent`:
     - `hud.ready` — re-push all state
     - `window.open` / `window.close` — UI only
     - `action.use` — forward to `PlayerController::ServerUseAbility`
     - `item.use`, `item.equip`, `item.unequip`
     - `prop.mount`, `prop.unmount`

### Data flow

```text
Backend SQLite ──► Unreal Listen/Dedicated Server (MMOGameMode)
                         │
                         ▼
              AMMOPlayerState (replicated)
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   AMyGameCharacter  PlayerController   HUD (CEF/React)
   (stats, meshes)     (RPCs/validation)  (render + request)
```

## Proposed UI additions

Add new windows using the existing `.panel`/`.window`/`.slot` CSS and the `UEViewport` component pattern.

1. **Character window** — real stats from `player.state`, job/subjob, level/XP.
2. **Inventory window** — grid of items by container, right-click menu (Use/Equip/Drop).
3. **Equipment window** — paper-doll slots, drag-and-drop from inventory.
4. **Actions/Spells window** — list of unlocked abilities/spells, drag to hotbar.
5. **Hotbar** — clickable slots sending `action.use`; show cooldown/MP/TP cost.
6. **Jobs window** — job list, switch main/sub, view unlocks per level.
7. **Prop/Mount window** — list owned props, mount/unmount.

Shared React infrastructure:
- `useUeState<T>(eventType)` hook over `onUeEvent`.
- `GameWindow` wrapper with title bar and close button.
- `Slot` component for inventory/equipment/hotbar.
- `ActionBar` component at the bottom of the screen.

## Implementation phases

### Phase A — Backend schema + internal endpoints
1. Migration: `item_definitions`, `character_stats`, `character_equipment`, `character_abilities`, `ability_definitions`, `character_props`.
2. New modules/services: `ItemsModule`, `AbilitiesModule`, `StatsModule`.
3. Extend `InternalController` with endpoints above.
4. Add player-facing read endpoints to `CharactersController`.
5. Seed minimal item + ability definitions for dev/testing.

### Phase B — Server-side load/save and PlayerState
1. Create `AMMOPlayerState` with replicated structs.
2. Extend `MMOGameMode::OnVerifyTokenResponse` to fetch all character data.
3. Implement save-on-logout/checkpoint in `MMOGameMode`.
4. Make `AMyGameCharacter` read stats from PlayerState.

### Phase C — HUD windows
1. Build `useUeState` hook and `GameWindow` wrapper.
2. Replace mock data in `HudView` with real event-driven state.
3. Implement Character, Inventory, Equipment, Actions, Jobs windows.
4. Add hotbar with `action.use` events.

### Phase D — Gameplay wiring
1. Add `AMMOPlayerController` with server RPCs.
2. Implement ability use: cooldowns, MP/TP cost, target validation, simple effect application.
3. Equipment: spawn/attach meshes to skeletal sockets; update derived stats.
4. Prop mounting: spawn actor from inventory item, attach to character, save transform.
5. Job switching and skill-tree unlocks.

### Phase E — Productionization
1. Batch state updates to reduce replication/HUD traffic.
2. Add server-side anti-cheat validations (inventory ownership, ability unlock checks).
3. Move to Postgres for concurrent world-scale writes.
4. Add WebSocket/presence channel for chat/party (separate system).

## Risks and open decisions

- **Stats source of truth**: backend table vs. `characters.state` JSON. A dedicated table is better for queries/admin, but the JSON blob is faster to load/save as a unit.
- **Abilities system**: use Unreal GameplayAbilitiesSystem (GAS) or custom cooldown/effect scripts? GAS is the standard for authoritative combat but adds setup cost. Recommend custom for the vertical slice, GAS for Phase D if combat complexity grows.
- **Item visuals**: `item_definitions` needs a matching UE `UDataTable` or asset path mapping. Need a convention such as `visual_path` in metadata.
- **Replication bandwidth**: pushing the whole inventory on every change is expensive. Plan to send diffs or use container-level invalidation.
- **Event-driven HUD**: no WebSocket from backend to game. The server polls domain events; the HUD is pushed by the game server. This matches the current architecture but means backend events are asynchronous.

## Implementation status

- [x] Phase A — Backend schema + internal endpoints for stats, equipment, item definitions, abilities, props, and hotbar.
- [x] Phase B (server-side) — `AMMOPlayerState`, async load of character/jobs/inventory/stats/equipment/abilities/hotbar/props in `MMOGameMode`, save on logout.
- [x] Phase B (HUD push) — `MMOGameInstance` pushes `player.state`, `inventory`, `equipment`, `abilities`, `hotbar`, `jobs`, and `props` to the React HUD.
- [x] Phase C — React HUD windows render the pushed state for unit frame, character, inventory, equipment, actions, jobs, and props. Party/chat/duty panels are still mock.
- [ ] Phase D — Gameplay wiring: ability use, equipment meshes, prop mounting, stat-derived movement/combat.

## First recommended slice

Implement **Phase A + the PlayerState load/save part of Phase B** first. This gives the backend data model and the Unreal server the ability to fetch/apply character data. The HUD can then render real numbers, and gameplay can be layered on top without re-architecting.
