# WebView HUD + Login (React/CEF)

The entire UI — login screen and in-game HUD — is one React app rendered by a
single CEF browser that lives for the whole session.

## Boot chain

1. `UMMOGameInstance` (`Source/MyGame/Variant_MMO/`) is the `GameInstanceClass`
   (`Config/DefaultEngine.ini`). On `FWorldDelegates::OnPostWorldInitialization`
   it creates `UMMOWebHud` (outer = GameInstance) and calls `AddToViewport(0)`.
   Viewport-attached widgets survive `OpenLevel`, so the page never reloads on
   map travel. `OnWorldBeginPlay` is a fallback if the viewport wasn't ready.
2. `UMMOWebHud::NativeOnInitialized` builds: `UOverlay` → `UCanvasPanel`
   (scene-capture image layer) + `UMMOWebBrowser` (transparent, loads
   `file:///<ContentDir>/WebUI/index.html`).
3. `NativeTick` binds `UMMOHudBridge` as `ue.hud` once `SWebBrowser` exists,
   then reloads the page so it sees the binding.

## Directions

- JS → UE: `ue.hud.notify({event, data})` → `BridgeNotify` → `OnHudEvent` →
  `UMMOGameInstance::HandleHudEvent`. Also `registerViewport`/`moveViewport`/
  `unregisterViewport` for 3D "holes".
- UE → JS: `UMMOWebHud::SendToPage` → `SWebBrowser::ExecuteJavascript` →
  `window.ueDispatch(jsonObject)`; subscribe in `ui/src/bridge.ts` via
  `onUeEvent`.

## Login flow

React `LoginScreen` sends `{"event":"login.submit","data":{username,password,
serverName,rememberMe}}`. The GameInstance resolves auth in this order:

1. `OnAuthenticationRequested` delegate bound (BP/native custom auth) —
   listener must call `CompleteLogin`.
2. `AuthBaseUrl` set (default `http://localhost:3000`) → `POST /auth/login`
   to the NestJS backend; tokens land on `AccessToken`/`RefreshToken`.
3. `bAllowDevelopmentLogin` + empty `AuthBaseUrl` → accept anything.
4. Otherwise pushes `login.result {ok:false, message}` back to the page.

`GET /auth/servers` is fetched once and pushed as `{"type":"servers"}`.
On success: `phase` becomes `"game"`, pushed to the page, then `OpenLevel`
to `PostLoginMap`. The page mounts with `{"event":"hello"}` to re-sync phase
(server list re-sent too).

## Input

- Login map: `AMMOLoginPlayerController` sets `FInputModeUIOnly` + cursor —
  only job left; the old UMG `MMOLoginWidget` is unused.
- Game map: `AMyGamePlayerController` sets `FInputModeGameAndUI` +
  `bShowMouseCursor` so React panels get hover/click while gameplay input
  still works.
- **RMB camera orbit**: `FCEFWebBrowserWindow::OnMouseButtonDown` returns
  `FReply::Handled()` for LMB/RMB/MMB, so the fullscreen `SWebBrowser` eats
  RMB before `GameAndUI` can route it to the game viewport. CSS
  `pointer-events:none` alone cannot fix this — Slate never consults the DOM
  hit test. `MMOWebHud.cpp` contains `FMMOOrbitInputProcessor` (a Slate
  `IInputProcessor`, registered in `NativeTick`) that consumes RMB at the
  application level and drives `Pawn::AddControllerYaw/PitchInput` directly
  when the page reports the cursor is over a non-interactive element.
  - The page reports interactivity via `ue.hud.notify {event:"pointer.overui",
    over:bool}`; the hook script (`OrbitHooksScript`) is injected by
    `NativeTick` every ~1.5 s (idempotent guard `window.__mmoOrbitHooks`).
    `e.target.closest(SEL)` already honors `pointer-events:none` — mark
    decorative regions that way, or tag interactive regions with
    `[data-ui-interactive]` to extend the selector list.
  - During orbit the cursor is hidden and re-pinned to the grab point each
    tick (`Cursor->SetPosition`) so drags can't hit the screen edge.
  - Right-click context menu is suppressed page-wide via `contextmenu`
    preventDefault in the injected script (React onContextMenu still fires).

## Build

`cd ui && npm run build` → single-file bundle at `Content/WebUI/index.html`.
Gotchas: page must stay transparent where 3D shows through (`background:
transparent` on viewport holes); CEF bridge binds async — retry sends;
diagnostics: `MMOHUD diag` log line every 3s from `NativeTick`.
