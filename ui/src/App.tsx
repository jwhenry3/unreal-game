import * as React from 'react';
import { useEffect, useState } from 'react';
import { UEViewport } from './UEViewport';
import { hasBridge, onUeEvent, sendEvent } from './bridge';
import { CharacterSelect, GameCharacter } from './CharacterSelect';
import { LoginScreen } from './Login';
import { RegisterScreen } from './RegisterScreen';

/* ------------------------------------------------------------------ types */

interface StatEntry {
    statKey: string;
    baseValue: number;
    bonusValue: number;
    currentValue: number;
}

interface EquipmentEntry {
    slotKey: string;
    itemKey: string;
    inventoryItemId: string;
    isVisible: boolean;
}

interface AbilityEntry {
    abilityKey: string;
    rank: number;
    isUnlocked: boolean;
    sourceJob: string;
    cooldownAt: string;
}

interface HotbarSlotEntry {
    slotId: number;
    type: string;
    abilityKey: string;
    inventoryItemId: string;
    macroId: string;
}

interface PropEntry {
    propId: string;
    propKey: string;
    inventoryItemId: string;
    isMounted: boolean;
    transform: string;
}

interface PlayerStateData {
    characterId: string;
    name: string;
    realm: string;
    mainJob: string;
    subJob: string;
    level: number;
    stats: StatEntry[];
    equipment: EquipmentEntry[];
    abilities: AbilityEntry[];
    hotbar: HotbarSlotEntry[];
    props: PropEntry[];
}

interface InventoryItem {
    id: string;
    itemKey: string;
    quantity: number;
    durability?: number | null;
    isBound?: boolean;
    container: string;
    slotIndex?: number | null;
    metadata?: Record<string, unknown> | null;
}

interface JobProgress {
    jobKey: string;
    level: number;
    experience: number;
    isUnlocked: boolean;
}

type HudWindow = 'character' | 'inventory' | 'equipment' | 'actions' | 'jobs' | 'props' | null;

/* --------------------------------------------------------------- helpers */

const MOCK_PARTY = [
    { n: 'Alphinaud L.', j: 'SCH', lv: 50, r: '#5aa05a', hp: 0.9, mp: 0.7 },
    { n: "Y'shtola R.", j: 'BLM', lv: 50, r: '#c86a5a', hp: 0.75, mp: 0.95 },
    { n: 'Thancred W.', j: 'NIN', lv: 50, r: '#c86a5a', hp: 0.82, mp: 0.4 },
    { n: 'Urianger A.', j: 'AST', lv: 50, r: '#5aa05a', hp: 1.0, mp: 0.6 },
];

const MOCK_CHAT = [
    { c: '#a0a8c0', t: '[1:22]Alphinaud: we have a problem at the Ceruleum field' },
    { c: '#7db3e8', t: '[1:23]<Party> Thancred: pulling in 10' },
    { c: '#c9b370', t: '[1:23]You obtain a piece of darksteel ore.' },
    { c: '#e86a5a', t: '[1:24]Qarn Guardian hits you for 1,842 damage.' },
];

const MOCK_QUESTS = [
    { k: 'Duty', kc: '#7a86c8', n: 'The Sunken Temple of Qarn', tasks: [['[ ]', 'Clear the Hall of the First']] },
    { k: 'Quest', kc: '#8b6f4e', n: 'Like Cats and Dogs', tasks: [['•', 'Gather coeurl hides', '2/4']] },
];

const EQUIPMENT_SLOTS = [
    'main_hand', 'off_hand', 'head', 'body', 'hands', 'legs', 'feet',
    'ears', 'neck', 'wrists', 'ring1', 'ring2',
];

function getStat(stats: StatEntry[] | undefined, key: string): StatEntry | undefined {
    return stats?.find(s => s.statKey.toLowerCase() === key.toLowerCase());
}

function statCurrent(stats: StatEntry[] | undefined, key: string): number {
    return getStat(stats, key)?.currentValue ?? 0;
}

function statMax(stats: StatEntry[] | undefined, key: string): number {
    const s = getStat(stats, key);
    return s ? s.baseValue + s.bonusValue : 0;
}

function itemIcon(item: InventoryItem): string {
    return item.itemKey
        .split(' ')
        .map(w => w[0]?.toUpperCase() ?? '')
        .join('')
        .slice(0, 2) || '?';
}

function abilityIcon(ability: AbilityEntry): string {
    return ability.abilityKey
        .split(' ')
        .map(w => w[0]?.toUpperCase() ?? '')
        .join('')
        .slice(0, 2) || '?';
}

function hotbarSlotLabel(slot: HotbarSlotEntry | undefined): string {
    if (!slot) return '';
    if (slot.type === 'ability') return slot.abilityKey.split(' ').map(w => w[0]?.toUpperCase()).join('').slice(0, 2);
    if (slot.type === 'item') return 'IT';
    if (slot.type === 'macro') return 'MC';
    return '';
}

/* ------------------------------------------------------------ components */

function Meter({ pct, cls, label, value, h }: { pct: number; cls: string; label?: string; value?: string; h?: number }) {
    return (
        <div className="meter" style={h ? { height: h } : undefined}>
            <div className={`fill ${cls}`} style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }} />
            {(label || value) && (
                <div className="txt"><span>{label}</span><span>{value}</span></div>
            )}
        </div>
    );
}

function ChatBox() {
    const [tab, setTab] = useState('All');
    return (
        <div className="panel chat">
            <div className="tabs">
                {['All', 'Social', 'System', 'Battle'].map(t => (
                    <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</div>
                ))}
            </div>
            <div className="panel-inset">
                <div className="log">
                    {MOCK_CHAT.map((l, i) => <div key={i} style={{ color: l.c }}>{l.t}</div>)}
                </div>
            </div>
            <input placeholder="Say something…  (/p /fc /shout)" />
        </div>
    );
}

function Hotbar({ hotbar, abilities }: { hotbar: HotbarSlotEntry[]; abilities: AbilityEntry[] }) {
    const slots = Array.from({ length: 12 }, (_, i) => hotbar.find(s => s.slotId === i + 1));
    const onClick = (slot: HotbarSlotEntry | undefined) => {
        if (!slot) return;
        sendEvent('action.use', { slotId: slot.slotId, type: slot.type, abilityKey: slot.abilityKey, inventoryItemId: slot.inventoryItemId });
    };
    return (
        <div className="hotbar">
            {slots.map((slot, i) => {
                const ability = slot?.type === 'ability' ? abilities.find(a => a.abilityKey === slot.abilityKey) : undefined;
                const label = slot?.type === 'ability' && ability ? abilityIcon(ability) : hotbarSlotLabel(slot);
                return (
                    <div key={i} className={`slot clickable ${!slot ? 'cooldown' : ''}`} onClick={() => onClick(slot)}>
                        <span className="glyph">{label}</span>
                        <span className="key">{i + 1 <= 9 ? String(i + 1) : i === 9 ? '0' : i === 10 ? '-' : '='}</span>
                    </div>
                );
            })}
        </div>
    );
}

function WindowShell({ title, onClose, children }: React.PropsWithChildren<{ title: string; onClose: () => void }>) {
    return (
        <div className="window" style={{ left: '34%', top: '14%' }}>
            <div className="wtitle">
                <span>{title}</span>
                <span className="wclose" onClick={onClose}>x</span>
            </div>
            <div className="wbody">{children}</div>
        </div>
    );
}

function CharacterWindow({ player, onClose }: { player: PlayerStateData | null; onClose: () => void }) {
    if (!player) return <WindowShell title="Character" onClose={onClose}><div className="xs dim">Loading…</div></WindowShell>;
    const hp = statCurrent(player.stats, 'hp');
    const hpMax = statMax(player.stats, 'hp');
    const mp = statCurrent(player.stats, 'mp');
    const mpMax = statMax(player.stats, 'mp');
    return (
        <WindowShell title="Character" onClose={onClose}>
            <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 190 }}>
                    <div className="title">{player.name}</div>
                    <div className="dim xs" style={{ marginBottom: 8 }}>{player.mainJob} / {player.subJob} · Level {player.level}</div>
                    <div className="xs dim" style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>HP</span><span>{hp.toLocaleString()} / {hpMax.toLocaleString()}</span></div>
                    <div className="xs dim" style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span>MP</span><span>{mp.toLocaleString()} / {mpMax.toLocaleString()}</span></div>
                    {['str', 'vit', 'dex', 'int', 'mnd', 'attack', 'defense', 'crit', 'haste'].map(key => {
                        const s = getStat(player.stats, key);
                        return (
                            <div key={key} className="xs dim" style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                <span style={{ textTransform: 'capitalize' }}>{key}</span>
                                <span style={{ color: 'var(--text)' }}>{s ? (s.baseValue + s.bonusValue).toLocaleString() : '—'}</span>
                            </div>
                        );
                    })}
                </div>
                <UEViewport id="paperdoll" className="viewport-frame" style={{ width: 240, height: 320 }}>
                    <span className="overlay-tag">3D Preview — rendered by UE</span>
                    <span className="overlay-foot">{hasBridge() ? 'live capture' : 'no bridge (dev preview)'}</span>
                </UEViewport>
            </div>
        </WindowShell>
    );
}

function InventoryWindow({ inventory, onClose }: { inventory: InventoryItem[]; onClose: () => void }) {
    const bag = inventory.filter(i => i.container === 'inventory');
    return (
        <WindowShell title="Inventory" onClose={onClose}>
            <div className="inventory-grid">
                {bag.length === 0 && <div className="xs dim">Inventory is empty.</div>}
                {bag.map(item => (
                    <div key={item.id} className="slot clickable inventory-slot" onClick={() => sendEvent('item.use', { inventoryItemId: item.id, itemKey: item.itemKey })}>
                        <span className="glyph">{itemIcon(item)}</span>
                        <span className="qty">{item.quantity > 1 ? item.quantity : ''}</span>
                    </div>
                ))}
            </div>
        </WindowShell>
    );
}

function EquipmentWindow({ player, onClose }: { player: PlayerStateData | null; onClose: () => void }) {
    const equipment = player?.equipment ?? [];
    return (
        <WindowShell title="Equipment" onClose={onClose}>
            <div className="equipment-grid">
                {EQUIPMENT_SLOTS.map(slot => {
                    const equipped = equipment.find(e => e.slotKey === slot);
                    return (
                        <div key={slot} className={`slot clickable equipment-slot ${equipped ? '' : 'cooldown'}`} onClick={() => equipped && sendEvent('item.unequip', { slot })}>
                            <span className="glyph">{equipped ? equipped.itemKey.split(' ').map(w => w[0]?.toUpperCase()).join('').slice(0, 2) : ''}</span>
                            <span className="key">{slot.replace('_', ' ')}</span>
                        </div>
                    );
                })}
            </div>
        </WindowShell>
    );
}

function ActionsWindow({ player, onClose }: { player: PlayerStateData | null; onClose: () => void }) {
    const abilities = player?.abilities.filter(a => a.isUnlocked) ?? [];
    return (
        <WindowShell title="Actions" onClose={onClose}>
            <div className="ability-list">
                {abilities.length === 0 && <div className="xs dim">No abilities learned.</div>}
                {abilities.map(a => (
                    <div key={a.abilityKey} className="ability-row clickable" onClick={() => sendEvent('action.use', { type: 'ability', abilityKey: a.abilityKey })}>
                        <span className="glyph">{abilityIcon(a)}</span>
                        <span className="ability-name">{a.abilityKey}</span>
                        <span className="faint xs">{a.sourceJob || '—'} · rank {a.rank}</span>
                    </div>
                ))}
            </div>
        </WindowShell>
    );
}

function JobsWindow({ jobs, onClose }: { jobs: JobProgress[]; onClose: () => void }) {
    return (
        <WindowShell title="Jobs" onClose={onClose}>
            <div className="job-list">
                {jobs.length === 0 && <div className="xs dim">No job data.</div>}
                {jobs.map(job => (
                    <div key={job.jobKey} className="job-row">
                        <span className="job-name">{job.jobKey}</span>
                        <span className="faint xs">Lv {job.level} · {job.experience} XP{job.isUnlocked ? '' : ' (locked)'}</span>
                    </div>
                ))}
            </div>
        </WindowShell>
    );
}

function PropsWindow({ player, onClose }: { player: PlayerStateData | null; onClose: () => void }) {
    const props = player?.props ?? [];
    return (
        <WindowShell title="Props" onClose={onClose}>
            <div className="prop-list">
                {props.length === 0 && <div className="xs dim">No props stored.</div>}
                {props.map(prop => (
                    <div key={prop.propId} className="prop-row clickable" onClick={() => sendEvent(prop.isMounted ? 'prop.unmount' : 'prop.mount', { propId: prop.propId, propKey: prop.propKey })}>
                        <span className="glyph">{prop.propKey.split(' ').map(w => w[0]?.toUpperCase()).join('').slice(0, 2)}</span>
                        <span className="prop-name">{prop.propKey}</span>
                        <span className="faint xs">{prop.isMounted ? 'Mounted' : 'Stored'}</span>
                    </div>
                ))}
            </div>
        </WindowShell>
    );
}

/** In-game HUD — everything behind the webview is the live 3D world. */
function HudView({ player, inventory, jobs }: { player: PlayerStateData | null; inventory: InventoryItem[]; jobs: JobProgress[] }) {
    const [openWindow, setOpenWindow] = useState<HudWindow>(null);

    useEffect(() => {
        sendEvent('hud.ready');
    }, []);

    const name = player?.name ?? 'Adventurer';
    const jobLabel = player ? `${player.mainJob} / ${player.subJob}` : 'Loading…';
    const level = player?.level ?? 1;
    const hp = statCurrent(player?.stats, 'hp');
    const hpMax = statMax(player?.stats, 'hp');
    const mp = statCurrent(player?.stats, 'mp');
    const mpMax = statMax(player?.stats, 'mp');
    const tp = statCurrent(player?.stats, 'tp');
    const tpMax = statMax(player?.stats, 'tp');
    const xp = jobs.find(j => j.jobKey === player?.mainJob)?.experience ?? 0;

    const menuRow1: Array<[string, HudWindow]> = [['Character', 'character'], ['Equipment', 'equipment'], ['Inventory', 'inventory'], ['Actions', 'actions']];
    const menuRow2: Array<[string, HudWindow]> = [['Jobs', 'jobs'], ['Props', 'props'], ['Map', null], ['Settings', null]];

    return (
        <div className="hud">
            <div className="top-left">
                <div className="panel unitframe">
                    <div className="name">{name}</div>
                    <div className="job">{jobLabel} · Lv {level}</div>
                    <Meter pct={hpMax ? hp / hpMax : 0} cls="hp" label="HP" value={hp.toLocaleString()} />
                    <Meter pct={mpMax ? mp / mpMax : 0} cls="mp" label="MP" value={mp.toLocaleString()} />
                    <Meter pct={tpMax ? tp / tpMax : 0} cls="tp" label="TP" value={tp.toLocaleString()} />
                </div>
                {MOCK_PARTY.map(m => (
                    <div key={m.n} className="party-row">
                        <div className="chip" style={{ background: m.r }}>{m.j[0]}</div>
                        <div className="mid">
                            <div className="name"><span>{m.n}</span><span className="faint">{m.j} {m.lv}</span></div>
                            <Meter pct={m.hp} cls="hp" />
                            <Meter pct={m.mp} cls="mp" />
                        </div>
                    </div>
                ))}
            </div>

            <div className="top-center">
                <div className="panel" style={{ width: 300, textAlign: 'center' }}>
                    <div style={{ color: 'var(--danger)' }}>Target Name</div>
                    <Meter pct={0.62} cls="hp" label="HP" value="62%" />
                </div>
            </div>

            <div className="top-right">
                <div className="panel xs" style={{ textAlign: 'right', width: 150 }}>
                    <div className="dim">{player?.realm ?? 'Unknown'}</div>
                    <div className="faint">(—, —)</div>
                </div>
                <div className="panel" style={{ width: 250 }}>
                    <div className="title xs" style={{ marginBottom: 5 }}>Duty</div>
                    {MOCK_QUESTS.map(q => (
                        <div key={q.n} style={{ marginBottom: 7 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span><span style={{ color: q.kc, fontSize: 10 }}>{q.k} </span><span className="xs">{q.n}</span></span>
                            </div>
                            {q.tasks.map((t, i) => (
                                <div key={i} className="xs dim" style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 10 }}>
                                    <span>{t[0]} {t[1]}</span><span>{t[2] ?? ''}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            <div className="bottom-left"><ChatBox /></div>

            <div className="bottom-center" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Hotbar hotbar={player?.hotbar ?? []} abilities={player?.abilities ?? []} />
            </div>

            <div className="bottom-right menubar">
                <div className="row">
                    {menuRow1.map(([label, key]) => (
                        <div key={label} className={`chipbtn clickable ${openWindow === key ? 'active' : ''}`} onClick={() => key && setOpenWindow(openWindow === key ? null : key)}>{label}</div>
                    ))}
                </div>
                <div className="row">
                    {menuRow2.map(([label, key]) => (
                        <div key={label} className={`chipbtn clickable ${openWindow === key ? 'active' : ''}`} onClick={() => key && setOpenWindow(openWindow === key ? null : key)}>{label}</div>
                    ))}
                </div>
            </div>

            <div className="xpbar"><Meter pct={Math.min(1, xp / 1000)} cls="exp" h={6} /></div>

            {openWindow === 'character' && <CharacterWindow player={player} onClose={() => setOpenWindow(null)} />}
            {openWindow === 'inventory' && <InventoryWindow inventory={inventory} onClose={() => setOpenWindow(null)} />}
            {openWindow === 'equipment' && <EquipmentWindow player={player} onClose={() => setOpenWindow(null)} />}
            {openWindow === 'actions' && <ActionsWindow player={player} onClose={() => setOpenWindow(null)} />}
            {openWindow === 'jobs' && <JobsWindow jobs={jobs} onClose={() => setOpenWindow(null)} />}
            {openWindow === 'props' && <PropsWindow player={player} onClose={() => setOpenWindow(null)} />}
        </div>
    );
}

/**
 * Root. One CEF page serves the whole session: it boots on the login map
 * (phase 'login'), and flips to the HUD when the game instance pushes
 * {"type":"phase","phase":"game"} after a successful auth + map travel.
 */
export function App() {
    const [phase, setPhase] = useState<'login' | 'register' | 'character-select' | 'game'>('login');
    const [servers, setServers] = useState<string[]>([]);
    const [characters, setCharacters] = useState<GameCharacter[]>([]);
    const [loginError, setLoginError] = useState('');
    const [player, setPlayer] = useState<PlayerStateData | null>(null);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [jobs, setJobs] = useState<JobProgress[]>([]);

    useEffect(() => onUeEvent(e => {
        if (e.type === 'phase' && (e.phase === 'login' || e.phase === 'register' || e.phase === 'character-select' || e.phase === 'game')) {
            setPhase(e.phase as 'login' | 'register' | 'character-select' | 'game');
        } else if (e.type === 'servers' && Array.isArray(e.servers)) {
            setServers(e.servers as string[]);
        } else if (e.type === 'characters' && Array.isArray(e.characters)) {
            setCharacters((e.characters as GameCharacter[]));
        } else if (e.type === 'login.result') {
            setLoginError(e.ok ? '' : String(e.message ?? 'Login failed.'));
        } else if (e.type === 'player.state' && e.data && typeof e.data === 'object') {
            setPlayer(e.data as PlayerStateData);
        } else if (e.type === 'inventory' && Array.isArray(e.data)) {
            setInventory(e.data as InventoryItem[]);
        } else if (e.type === 'jobs' && Array.isArray(e.data)) {
            setJobs(e.data as JobProgress[]);
        }
    }), []);

    // announce ourselves once the UE bridge is bound (it attaches async)
    useEffect(() => {
        const t = window.setInterval(() => {
            if (sendEvent('hello')) window.clearInterval(t);
        }, 250);
        return () => window.clearInterval(t);
    }, []);

    if (phase === 'login') {
        return (
            <LoginScreen
                servers={servers}
                externalError={loginError}
                onErrorSeen={() => setLoginError('')}
                onDevSkip={hasBridge() ? undefined : () => setPhase('game')}
                onSwitchToRegister={() => setPhase('register')}
            />
        );
    }
    if (phase === 'register') {
        return (
            <RegisterScreen
                externalError={loginError}
                onSwitchToLogin={() => setPhase('login')}
                onDevSkip={hasBridge() ? undefined : () => setPhase('game')}
            />
        );
    }
    if (phase === 'character-select') {
        return (
            <CharacterSelect
                characters={characters.length ? characters : []}
                externalError={loginError}
            />
        );
    }
    return <HudView player={player} inventory={inventory} jobs={jobs} />;
}
