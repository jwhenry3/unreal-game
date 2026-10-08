import { sendEvent } from './bridge';

/**
 * Reports DOM text-field focus to UE so the game can suspend gameplay input
 * (movement, jump, etc.) while the user types. CEF gives Slate no visibility
 * into which element holds focus inside the page, so the page reports it.
 */

function isEditable(el: EventTarget | null): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function report(focused: boolean): void {
    sendEvent('ui.textfocus', { focused });
}

export function installInputFocusReporting(): void {
    document.addEventListener('focusin', (e) => {
        if (isEditable(e.target)) report(true);
    });
    document.addEventListener('focusout', () => {
        report(false);
    });
    window.addEventListener('blur', () => report(false));
}
