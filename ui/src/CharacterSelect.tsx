import * as React from 'react';
import { useEffect, useState } from 'react';
import { sendEvent } from './bridge';

export interface GameCharacter {
    id: string;
    name: string;
    realm: string;
    mainJob: string;
    subJob?: string | null;
    level?: number;
}

interface CharacterSelectProps {
    characters: GameCharacter[];
    externalError: string;
}

export function CharacterSelect({ characters, externalError }: CharacterSelectProps) {
    const [selected, setSelected] = useState<string>(characters[0]?.id ?? '');
    const [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newJob, setNewJob] = useState('Adventurer');
    const [newSubJob, setNewSubJob] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        setBusy(false);
        if (externalError) {
            setError(externalError);
        }
    }, [externalError]);

    useEffect(() => {
        // A refreshed character list while the create form is active means
        // the create succeeded; clear the form and select the first character.
        if (creating && busy) {
            setBusy(false);
            setCreating(false);
            setNewName('');
            setNewSubJob('');
            if (characters.length && !selected) {
                setSelected(characters[0].id);
            }
        }
    }, [characters]);

    const play = () => {
        if (!selected || busy) return;
        setBusy(true);
        sendEvent('character.select', { characterId: selected });
    };

    const create = (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || !newName.trim()) return;
        if (newName.trim().length < 3) {
            setError('Character name must be at least 3 characters.');
            return;
        }
        setError('');
        setBusy(true);
        if (!sendEvent('character.create', {
            name: newName.trim(),
            job: newJob.trim() || 'Adventurer',
            subJob: newSubJob.trim(),
        })) {
            setBusy(false);
            setError('Not connected to the game (no bridge).');
        }
    };

    return (
        <div className="login-screen">
            <div className="panel login-panel">
                <div className="login-title">SELECT CHARACTER</div>
                <div className="login-sub dim">Choose a character to enter the world</div>

                <div className="character-list">
                    {characters.length === 0 && <div className="character-row dim">No characters yet.</div>}
                    {characters.map(c => (
                        <div
                            key={c.id}
                            className={`character-row ${selected === c.id ? 'selected' : ''}`}
                            onClick={() => setSelected(c.id)}
                        >
                            <div className="character-name">{c.name}</div>
                            <div className="character-meta dim">
                                {c.realm} · {c.mainJob}
                                {c.subJob ? ` / ${c.subJob}` : ''}
                                {c.level !== undefined ? ` · Lv ${c.level}` : ''}
                            </div>
                        </div>
                    ))}
                </div>

                {!creating ? (
                    <>
                        <button className="login-btn" onClick={play} disabled={!selected || busy}>
                            {busy ? 'Entering world…' : 'Play'}
                        </button>
                        <button className="login-btn secondary" onClick={() => setCreating(true)} disabled={busy}>
                            Create New Character
                        </button>
                    </>
                ) : (
                    <form onSubmit={create}>
                        <div className="login-title">CREATE CHARACTER</div>
                        <label className="login-label" htmlFor="char-name">Name</label>
                        <input id="char-name" className="login-input" value={newName}
                            onChange={e => setNewName(e.target.value)} disabled={busy} />

                        <label className="login-label" htmlFor="char-job">Main Job</label>
                        <input id="char-job" className="login-input" value={newJob}
                            onChange={e => setNewJob(e.target.value)} disabled={busy} />

                        <label className="login-label" htmlFor="char-subjob">Sub Job</label>
                        <input id="char-subjob" className="login-input" value={newSubJob}
                            onChange={e => setNewSubJob(e.target.value)} disabled={busy} />

                        {error && <div className="login-error">{error}</div>}

                        <button type="submit" className="login-btn" disabled={busy || !newName.trim()}>
                            {busy ? 'Creating…' : 'Create Character'}
                        </button>
                        <button type="button" className="login-btn secondary" onClick={() => { setCreating(false); setError(''); }} disabled={busy}>
                            Cancel
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
