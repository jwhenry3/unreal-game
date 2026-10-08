/**
 * Bridge to the UE-side UMMOHudBridge, bound into the page as `ue.hud`.
 * UFUNCTION names are exposed lowercased-first-letter by the CEF binding.
 *
 * Directions:
 *   JS -> UE: bridgeCall('Notify', {event, data})  (or sendEvent helper)
 *   UE -> JS: UMMOGameInstance calls window.ueDispatch(<json object>) via
 *             ExecuteJavascript; subscribe with onUeEvent.
 */

interface UeNamespace {
    hud?: Record<string, (payload: string) => void>;
    interface?: Record<string, (payload: string) => void>;
}

export interface UeEvent {
    type: string;
    [key: string]: unknown;
}

type UeEventHandler = (e: UeEvent) => void;

declare global {
    interface Window {
        ue?: UeNamespace;
        ueDispatch?: (msg: UeEvent) => void;
    }
}

const listeners = new Set<UeEventHandler>();

// UE pushes events here via ExecuteJavascript("window.ueDispatch({...})").
// Defined eagerly at module load so the sink exists before the page signals hello.
window.ueDispatch = (msg: UeEvent) => {
    for (const l of listeners) {
        try {
            l(msg);
        } catch (err) {
            console.error('ueDispatch listener failed', err);
        }
    }
};

/** Subscribe to events pushed from UE. Returns an unsubscribe function. */
export function onUeEvent(cb: UeEventHandler): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

function api(): Record<string, (p: string) => void> | null {
    const ue = (window as Window).ue;
    return (ue?.hud ?? ue?.interface) || null;
}

/** Call a bridge method, trying the lowercased-first-letter form first. */
export function bridgeCall(name: string, payload: object): boolean {
    const target = api();
    if (!target) return false;
    const lower = name[0].toLowerCase() + name.slice(1);
    const fn = target[lower] ?? target[name];
    if (typeof fn !== 'function') return false;
    fn.call(target, JSON.stringify(payload));
    return true;
}

/** Send a named event to UMMOGameInstance::HandleHudEvent. */
export function sendEvent(event: string, data?: object): boolean {
    return bridgeCall('Notify', { event, data: data ?? {} });
}

/** True when running inside the UE webview with a bound bridge. */
export function hasBridge(): boolean {
    return api() !== null;
}
