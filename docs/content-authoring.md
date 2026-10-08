# Content Authoring (Content Studio)

> **Status: stale / not in tree.** Last verified: 2026-10-08.
>
> This page describes a ReactorUMG-based editor tool and `GameData/` JSON
> pipeline that was planned but is **not present in the current working tree**.
> `TypeScript/src/MyGame/Editor/...` and `GameData/` do not exist; the notes below
> are archived so we can revive the design if/when a content-authoring system is
> needed. For now, game content definitions (items, skills, quests, NPCs) are not
> implemented on either client or server.

Original design: an in-editor tool for authoring game content definitions, built
as a ReactorUMG editor utility widget.

## Where things live

- Widget: `TypeScript/src/MyGame/Editor/UI/EUW_ContentAuthoring/`
  - `EUW_ContentAuthoring.tsx` — 3-pane shell: type nav / entry list / form
  - `fields.tsx` — schema-driven field editors (dispatches on `FieldDef.type`)
- Schemas: `TypeScript/src/MyGame/Editor/Content/schema.ts` — every content
  type declares its fields; the form is generated from this.
- Persistence: `TypeScript/src/MyGame/Editor/Content/store.ts` — reads/writes
  `<ProjectDir>/GameData/<typeId>.json` via `UE.FileSystemOperation`
  (editor-only BP library).

## Content types

races, characters, equipment, items, skills (== actions), combatJobs,
craftingJobs, recipes, resourceNodes, buildingParts, shops, quests, npcs.
Defined in `CONTENT_TYPES` in schema.ts — add a new type by appending a
`ContentTypeDef`; no widget changes needed.

## Data format

`GameData/<typeId>.json`:

```json
{ "version": 1, "entries": [ { "id": "iron_sword", "name": "Iron Sword", ... } ] }
```

Every entry has a unique `id` slug — the primary key used by `ref` fields to
link content (e.g. `recipe.job -> craftingJobs entry id`).

## Field types

`string`, `text`, `int`, `float`, `bool`, `enum` (options[]), `ref`
(refType + entry id), `list` (item schema, incl. objects), `object` (nested
fields).

## ReactorUMG gotchas learned

- `div`/containers have NO mouse events — use `<Button>` (single child only,
  it's a ContentWidget) for clickable rows.
- `<input type="text">` is uncontrolled: pass `defaultValue`, commit via
  `onChange` (`e.target.value`). `value` prop is ignored.
- `<select>` takes `<option value>label</option>` children; `value` prop +
  `onChange` (`e.target.value`) work.
- `<input type="checkbox">` supports `checked` + `onChange` (`e.target.checked`).
- ReactorUMG `Style` type has `margin`/`padding` shorthands only — no
  `marginLeft`/`marginTop`. Intrinsic elements (`div`, `input`) use React DOM
  CSSProperties so those are fine there.

## To add the editor widget asset

The launch.tsx/index.tsx boilerplate follows the same convention as
`EUW_ReactorHello`. Create the EUW asset the same way the existing ones were
made, pointing at `Editor/UI/EUW_ContentAuthoring/launch.js` after `yarn build`.
