import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { hasBridge, sendEvent } from './bridge';

interface RegisterScreenProps {
    externalError: string;
    onSwitchToLogin: () => void;
    onDevSkip?: () => void;
}

export function RegisterScreen({ externalError, onSwitchToLogin, onDevSkip }: RegisterScreenProps) {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
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

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!username.trim() || !email.trim() || !password) {
            setError('Enter an account name, email, and password.');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setError('');
        setBusy(true);
        if (!sendEvent('register.submit', {
            username: username.trim(),
            email: email.trim().toLowerCase(),
            password,
        })) {
            setBusy(false);
            setError('Not connected to the game (no bridge).');
        }
    };

    return (
        <div className="login-screen">
            <form className="panel login-panel" onSubmit={submit}>
                <div className="login-title">CREATE ACCOUNT</div>
                <div className="login-sub dim">Register a new account</div>

                <label className="login-label" htmlFor="reg-user">Account Name</label>
                <input id="reg-user" ref={userRef} className="login-input" autoComplete="username"
                    value={username} onChange={e => setUsername(e.target.value)} disabled={busy} />

                <label className="login-label" htmlFor="reg-email">Email</label>
                <input id="reg-email" type="email" className="login-input" autoComplete="email"
                    value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />

                <label className="login-label" htmlFor="reg-pass">Password</label>
                <input id="reg-pass" type="password" className="login-input" autoComplete="new-password"
                    value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />

                <label className="login-label" htmlFor="reg-confirm">Confirm Password</label>
                <input id="reg-confirm" type="password" className="login-input" autoComplete="new-password"
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={busy} />

                {error && <div className="login-error">{error}</div>}

                <button type="submit" className="login-btn" disabled={busy}>
                    {busy ? 'Creating account…' : 'Create Account'}
                </button>

                <div className="login-links">
                    <span className="login-link" onClick={onSwitchToLogin}>Already have an account? Sign in</span>
                </div>

                {!hasBridge() && onDevSkip && (
                    <div className="login-dev">
                        dev preview — no UE bridge.
                        <span className="login-link" onClick={onDevSkip}> skip to HUD →</span>
                    </div>
                )}
            </form>
        </div>
    );
}
