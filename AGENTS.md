# Agent Instructions

## LLM Wiki (`docs/`)

The `docs/` folder is this project's **persistent memory store** — an LLM-maintained wiki of project knowledge and research. Treat it as long-term memory that survives across sessions.

### Read before you work

- At the start of a task, check `docs/` for pages relevant to the area you're touching (architecture, systems, prior research, decisions, gotchas).
- Prefer consulting the wiki over re-deriving knowledge that may already be recorded there.
- If the wiki contradicts the code, trust the code — and update the wiki.

### Write back what you learn

Update or create pages in `docs/` when you:

- Learn something non-obvious about the codebase (architecture, data flow, build quirks, engine version specifics).
- Complete research (library comparisons, Unreal Engine API findings, external docs summaries) — record the conclusion and key sources.
- Make or discover a design decision and its rationale.
- Hit a pitfall or workaround future agents would otherwise rediscover the hard way.

### Cache external sources in `docs/sources/`

When you fetch useful material from the web — documentation pages, API references, example source code, forum answers — **save a local copy under `docs/sources/`** so future sessions don't need to re-fetch it.

- Mirror the origin in the filename/path, e.g. `docs/sources/github.com/UnrealEnginePython--README.md` or `docs/sources/ue-docs/udn-enhanced-input.md`.
- Include the source URL and fetch date at the top of each cached file.
- Prefer relevant excerpts over whole-page dumps when the page is huge.
- Check `docs/sources/` before reaching for the web — the answer may already be cached.
- Respect licenses: cache for reference, don't vendored-copy code into the shipped project without checking terms.

### Organization

- One topic per markdown file; use descriptive names (e.g. `docs/unreal-mcp-bridge.md`, `docs/backend-auth.md`).
- Keep `docs/README.md` as an index linking to every page — update it when adding pages.
- Keep pages concise and factual. Link to source files (`Source/...`, `backend/src/...`) rather than pasting large code blocks, which go stale.
- Date significant entries (e.g. `> Last verified: 2026-10-07`) so future agents can judge freshness.

### What does NOT belong in the wiki

- Secrets, credentials, or anything that shouldn't be committed.
- Verbose code dumps — the codebase is the source of truth for code.
- Task logs or session transcripts — record durable knowledge, not play-by-play.
