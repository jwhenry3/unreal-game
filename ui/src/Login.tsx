import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { hasBridge, sendEvent } from './bridge';

interface LoginScreenProps {
    /** server names pushed by the game instance (GET /auth/servers) */
    servers: string[];
    /** error pushed by UE for a failed auth attempt */
    externalError: string;
    /** clear the pushed error (e.g. on retry) */
    onErrorSeen?: () => void;
    /** dev-preview escape hatch when there's no bridge (plain browser) */
    onDevSkip?: () => void;
    /** switch to the registration form */
    onSwitchToRegister?: () => void;
}

/**
 * MMO login screen — rendered by the same page as the in-game HUD. Submits
 * credentials to UE over the bridge; the game instance authenticates against
 * the backend (POST /auth/login) and travels to the play map on success.
 */
export function LoginScreen({ servers, externalError, onDevSkip, onSwitchToRegister }: LoginScreenProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [server, setServer] = useState('');
    const [remember, setRemember] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const userRef = useRef<HTMLInputElement>(null);

    useEffect(() => { userRef.current?.focus(); }, []);

    useEffect(() => {
        if (externalError) {
            setError(externalError);
            setBusy(false);
        }
    }, [externalError]);

    // pick a default server once the list arrives
    useEffect(() => {
        if (!server && servers.length) setServer(servers[0]);
    }, [servers, server]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!username.trim() || !password) {
            setError('Enter an account name and password.');
            return;
        }
        setError('');
        setBusy(true);
        if (!sendEvent('login.submit', {
            username: username.trim(),
            password,
            serverName: server,
            rememberMe: remember,
        })) {
            setBusy(false);
            setError('Not connected to the game (no bridge).');
        }
    };

    const quit = () => sendEvent('login.quit');

    return (
        <div className="login-screen">
            <form className="panel login-panel" onSubmit={submit}>
                <div className="login-title">MY&nbsp;GAME</div>
                <div className="login-sub dim">Sign in with your account</div>

                <label className="login-label" htmlFor="login-user">Account Name</label>
                <input id="login-user" ref={userRef} className="login-input" autoComplete="username"
                    value={username} onChange={e => setUsername(e.target.value)} disabled={busy} />

                <label className="login-label" htmlFor="login-pass">Password</label>
                <input id="login-pass" type="password" className="login-input" autoComplete="current-password"
                    value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />

                {servers.length > 0 && (
                    <>
                        <label className="login-label" htmlFor="login-server">World</label>
                        <select id="login-server" className="login-input"
                            value={server} onChange={e => setServer(e.target.value)} disabled={busy}>
                            {servers.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </>
                )}

                <label className="login-remember">
                    <input type="checkbox" checked={remember}
                        onChange={e => setRemember(e.target.checked)} disabled={busy} />
                    <span>Remember account name</span>
                </label>

                {error && <div className="login-error">{error}</div>}

                <button type="submit" className="login-btn" disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign In'}
                </button>

                <div className="login-links">
                    <span className="login-link" onClick={() => sendEvent('login.forgot')}>Forgot password?</span>
                    {onSwitchToRegister && <span className="login-link" onClick={onSwitchToRegister}>Create account</span>}
                    <span className="login-link" onClick={quit}>Quit</span>
                </div>

                {!hasBridge() && (
                    <div className="login-dev">
                        dev preview — no UE bridge.
                        {onDevSkip && <span className="login-link" onClick={onDevSkip}> skip to HUD →</span>}
                    </div>
                )}
            </form>
        </div>
    );
}
