import React, { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, formatDate, getJson, Json, PageHeading, sendJson } from './shared';

const emptyContent = {
  title: '',
  slug: '',
  summary: '',
  body: '',
  status: 'draft',
  tags: '',
  version: '',
  channel: '',
  author: '',
};

const emptyCommunity = {
  category: 'general',
  title: '',
  body: '',
  author: 'community-team',
  status: 'open',
  pinned: false,
};

const contentBasePath = (type: 'post' | 'update') => type === 'post' ? '/cms/posts' : '/cms/updates';
const contentNoun = (type: 'post' | 'update') => type === 'post' ? 'post' : 'update';

export function CmsDashboardPage() {
  const [items, setItems] = useState<Json[]>([]);
  const [status, setStatus] = useState<Json>();
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => Promise.all([
      getJson('/v1/cms/content?type=post'),
      getJson('/v1/cms/content?type=update'),
      getJson('/v1/cms/status'),
    ])
      .then(([posts, updates, nextStatus]) => {
        setItems([...posts, ...updates].sort((a, b) => Date.parse(b.publishedAt || b.updatedAt) - Date.parse(a.publishedAt || a.updatedAt)));
        setStatus(nextStatus);
        setError('');
      })
      .catch((reason: Error) => setError(reason.message));
    void load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, []);

  return <>
    <PageHeading kicker="CMS" title="Overview"><span className="caption">Newest posts and updates</span></PageHeading>
    {error && <div className="error-banner">{error}</div>}
    <section className="overview-layout">
      <div className="news-feed">
        {items.map(item => <NewsItem item={item} key={item.id} />)}
        {!items.length && <EmptyState>No posts or updates have been created.</EmptyState>}
      </div>
      <AccountStatusPanel status={status} />
    </section>
  </>;
}

function NewsItem({ item }: { item: Json }) {
  const [expanded, setExpanded] = useState(false);
  const excerpt = String(item.summary || item.body || '').trim();
  const shortExcerpt = excerpt.length > 180 ? `${excerpt.slice(0, 180).trim()}…` : excerpt;
  const canExpand = !expanded && (Boolean(item.body && item.body !== item.summary) || excerpt.length > 180);
  const timestamp = item.publishedAt || item.updatedAt;

  return <article className="news-item">
    <div className="news-meta"><span className={`content-type ${item.type}`}>{item.type}</span><span>{formatDate(timestamp)}</span><span className={`health-pill ${item.status === 'published' ? '' : 'warn'}`}>{item.status}</span></div>
    <h3>{item.title}</h3>
    <p>{expanded ? item.body || excerpt : shortExcerpt || 'No summary provided.'}</p>
    <div className="news-actions">
      {canExpand && <button onClick={() => setExpanded(true)}>Show more</button>}
      {expanded && <button onClick={() => setExpanded(false)}>Show less</button>}
      <Link className="table-action" to={`${contentBasePath(item.type)}/${item.id}/edit`}>Edit</Link>
    </div>
  </article>;
}

function AccountStatusPanel({ status }: { status?: Json }) {
  const [mode, setMode] = useState<'details' | 'login' | 'register'>('details');
  const [account, setAccount] = useState<Json | null>(() => readStoredAccount());
  const [realm, setRealm] = useState(() => localStorage.getItem('mygame.cms.realm') || '');
  const [form, setForm] = useState<Json>({ username: '', email: '', password: '', rememberMe: true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const realms = status?.realms || [];
  const selectedRealm = realm || realms[0]?.name || '';

  useEffect(() => {
    const token = localStorage.getItem('mygame.cms.accessToken');
    if (!token) return;
    void authRequest('/v1/cms/auth/me', 'GET', undefined, token)
      .then(setAccount)
      .catch(async () => {
        const refreshed = await refreshAccount().catch(() => null);
        setAccount(refreshed?.user ?? null);
      });
  }, []);

  const updateField = (field: string, value: string | boolean) => setForm(current => ({ ...current, [field]: value }));
  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await authRequest('/v1/cms/auth/login', 'POST', {
        username: form.username,
        password: form.password,
        serverName: selectedRealm || undefined,
        rememberMe: form.rememberMe,
      });
      storeSession(response);
      setAccount(response.user);
      setRealm(selectedRealm);
      setMode('details');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const submitRegister = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await authRequest('/v1/cms/auth/register', 'POST', {
        username: form.username,
        email: form.email,
        password: form.password,
      });
      storeSession(response);
      setAccount(response.user);
      setMode('details');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    const token = localStorage.getItem('mygame.cms.accessToken');
    const refreshToken = localStorage.getItem('mygame.cms.refreshToken');
    if (token) await authRequest('/v1/cms/auth/logout', 'POST', { refreshToken }, token).catch(() => undefined);
    clearSession();
    setAccount(null);
    setMode('details');
  };

  return <aside className="account-panel">
    <div className="section-heading"><h3>Account</h3><span className={`health-pill ${account ? '' : 'warn'}`}>{account ? 'signed in' : 'signed out'}</span></div>
    {error && <div className="error-banner">{error}</div>}
    {account ? <div className="account-card">
      <strong>{account.displayName}</strong>
      <span>@{account.username}</span>
      <span>{account.email || 'No email'}</span>
      {selectedRealm && <span>Realm · {selectedRealm}</span>}
      <button onClick={() => void logout()}>Sign out</button>
    </div> : mode === 'details' ? <div className="account-card">
      <strong>No account signed in</strong>
      <span>Sign in to view account details.</span>
      <div className="account-actions"><button className="primary" onClick={() => setMode('login')}>Log in</button><button onClick={() => setMode('register')}>Register</button></div>
    </div> : <form className="account-form" onSubmit={mode === 'login' ? submitLogin : submitRegister}>
      <label>{mode === 'login' ? 'Username or email' : 'Username'}<input required value={form.username} onChange={event => updateField('username', event.target.value)} /></label>
      {mode === 'register' && <label>Email<input required type="email" value={form.email} onChange={event => updateField('email', event.target.value)} /></label>}
      <label>Password<input required type="password" value={form.password} onChange={event => updateField('password', event.target.value)} /></label>
      {mode === 'login' && realms.length > 0 && <label>Realm<select value={selectedRealm} onChange={event => setRealm(event.target.value)}>{realms.map((item: Json) => <option key={item.name}>{item.name}</option>)}</select></label>}
      {mode === 'login' && <label className="checkbox"><input type="checkbox" checked={form.rememberMe} onChange={event => updateField('rememberMe', event.target.checked)} /> Remember me</label>}
      <div className="form-actions"><button type="button" onClick={() => setMode('details')}>Back</button><button className="primary" disabled={busy} type="submit">{mode === 'login' ? 'Log in' : 'Register'}</button></div>
    </form>}
    <div className="status-list">
      <div><span>Account server</span><strong className={status?.backend?.online ? 'positive' : 'negative'}>{status?.backend?.status || 'unknown'}</strong></div>
      <div><span>Realm status</span><strong className={status?.realmStatus === 'online' ? 'positive' : 'negative'}>{status?.realmStatus || 'unknown'}</strong></div>
    </div>
    <div className="realm-list">{realms.map((item: Json) => <div key={item.name}><span>{item.name}</span><strong className={item.status === 'online' ? 'positive' : 'negative'}>{item.status}</strong></div>)}</div>
    {!realms.length && <span className="caption">No realms returned by the backend.</span>}
  </aside>;
}

function readStoredAccount(): Json | null {
  try {
    const value = localStorage.getItem('mygame.cms.account');
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function storeSession(response: Json): void {
  localStorage.setItem('mygame.cms.accessToken', response.accessToken);
  localStorage.setItem('mygame.cms.refreshToken', response.refreshToken);
  localStorage.setItem('mygame.cms.account', JSON.stringify(response.user));
}

function clearSession(): void {
  localStorage.removeItem('mygame.cms.accessToken');
  localStorage.removeItem('mygame.cms.refreshToken');
  localStorage.removeItem('mygame.cms.account');
}

async function refreshAccount(): Promise<Json | null> {
  const refreshToken = localStorage.getItem('mygame.cms.refreshToken');
  if (!refreshToken) {
    clearSession();
    return null;
  }
  const response = await authRequest('/v1/cms/auth/refresh', 'POST', { refreshToken });
  storeSession(response);
  return response;
}

async function authRequest(url: string, method: string, body?: unknown, token?: string): Promise<Json> {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `Request failed with HTTP ${response.status}`);
  return data;
}

export function PostsPage() {
  return <ContentListPage type="post" title="Blog posts" description="Create and manage public-facing posts." />;
}

export function PostEditorPage() {
  return <ContentEditorPage type="post" title="Blog post" />;
}

export function UpdatesPage() {
  return <ContentListPage type="update" title="Updates" description="Create and manage update and release communications." />;
}

export function UpdateEditorPage() {
  return <ContentEditorPage type="update" title="Update" />;
}

function ContentListPage({ type, title, description }: { type: 'post' | 'update'; title: string; description: string }) {
  const [items, setItems] = useState<Json[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const basePath = contentBasePath(type);
  const isUpdate = type === 'update';

  const load = () => {
    const params = new URLSearchParams({ type });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    return getJson(`/v1/cms/content?${params}`)
      .then((data) => { setItems(data); setError(''); })
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => { void load(); }, [type, status]);

  const remove = async (item: Json) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    await sendJson(`/v1/cms/content/${item.id}`, 'DELETE');
    await load();
  };

  return <>
    <PageHeading kicker="CMS" title={title}><Link className="button-link primary" to={`${basePath}/new`}>New {contentNoun(type)}</Link></PageHeading>
    <p className="section-description">{description}</p>
    {error && <div className="error-banner">{error}</div>}
    <section className="section">
      <div className="controls"><input type="search" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && load()} placeholder={`Search ${title.toLowerCase()}`} /><select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select><button onClick={() => void load()}>Refresh</button></div>
      <div className="table-wrap"><table><thead><tr><th>Title</th><th>Status</th>{isUpdate && <th>Version</th>}<th>Updated</th><th></th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.title}</strong><small>/{item.slug}</small></td><td><span className={`health-pill ${item.status === 'published' ? '' : 'warn'}`}>{item.status}</span></td>{isUpdate && <td>{item.version || '—'}</td>}<td>{formatDate(item.updatedAt)}</td><td className="actions"><Link className="table-action" to={`${basePath}/${item.id}/edit`}>Edit</Link><button className="danger" onClick={() => void remove(item)}>Delete</button></td></tr>)}</tbody></table></div>
      {!items.length && <EmptyState>No {type}s found.</EmptyState>}
    </section>
  </>;
}

function ContentEditorPage({ type, title }: { type: 'post' | 'update'; title: string }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<Json>({ ...emptyContent });
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState('');
  const basePath = contentBasePath(type);
  const isUpdate = type === 'update';

  useEffect(() => {
    if (!id) {
      setForm({ ...emptyContent });
      setLoading(false);
      return;
    }
    setLoading(true);
    getJson(`/v1/cms/content/${id}`)
      .then((item) => {
        setForm({ ...item, tags: (item.tags || []).join(', ') });
        setError('');
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [id]);

  const updateField = (field: string, value: string) => setForm(current => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const body = {
      type,
      title: form.title,
      slug: form.slug,
      summary: form.summary,
      body: form.body,
      status: form.status,
      tags: String(form.tags || '').split(',').map((tag: string) => tag.trim()).filter(Boolean),
      version: form.version,
      channel: form.channel,
      author: form.author,
    };
    try {
      await sendJson(id ? `/v1/cms/content/${id}` : '/v1/cms/content', id ? 'PATCH' : 'POST', body);
      navigate(basePath);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return <>
    <BackLink to={basePath} label={`Back to ${type === 'post' ? 'posts' : 'updates'}`} />
    <PageHeading kicker="CMS" title={`${id ? 'Edit' : 'New'} ${title.toLowerCase()}`}><span className="caption">Changes save to the CMS database</span></PageHeading>
    {error && <div className="error-banner">{error}</div>}
    {loading ? <EmptyState>Loading {contentNoun(type)}…</EmptyState> : <section className="section editor-page"><form className="editor-form" onSubmit={submit}>
      <label>Title<input required value={form.title} onChange={event => updateField('title', event.target.value)} /></label>
      <label>Slug<input value={form.slug} onChange={event => updateField('slug', event.target.value)} placeholder="Generated from title" /></label>
      <label>Summary<input value={form.summary} onChange={event => updateField('summary', event.target.value)} /></label>
      {isUpdate && <div className="form-row"><label>Version<input value={form.version} onChange={event => updateField('version', event.target.value)} placeholder="0.2.0" /></label><label>Channel<input value={form.channel} onChange={event => updateField('channel', event.target.value)} placeholder="stable" /></label></div>}
      <div className="form-row"><label>Status<select value={form.status} onChange={event => updateField('status', event.target.value)}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label>Author<input value={form.author} onChange={event => updateField('author', event.target.value)} /></label></div>
      <label>Tags<input value={form.tags} onChange={event => updateField('tags', event.target.value)} placeholder="comma, separated" /></label>
      <label>Body<textarea rows={12} value={form.body} onChange={event => updateField('body', event.target.value)} /></label>
      <div className="form-actions"><Link className="button-link" to={basePath}>Cancel</Link><button className="primary" type="submit">{id ? 'Save changes' : `Create ${contentNoun(type)}`}</button></div>
    </form></section>}
  </>;
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Json[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = () => getJson(`/v1/cms/accounts${search ? `?search=${encodeURIComponent(search)}` : ''}`)
    .then((data) => { setAccounts(data); setError(''); })
    .catch((reason: Error) => { setAccounts([]); setError(reason.message); });
  useEffect(() => { void load(); }, []);

  const setActive = async (account: Json, isActive: boolean) => {
    setBusyId(account.id);
    setError('');
    try {
      await sendJson(`/v1/cms/accounts/${account.id}`, 'PATCH', { isActive });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyId('');
    }
  };

  return <>
    <PageHeading kicker="CMS" title="Account management"><span className="caption">Backed by NestJS internal service APIs</span></PageHeading>
    {error && <div className="error-banner">{error}</div>}
    <section className="section"><div className="controls"><input type="search" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && load()} placeholder="Search username, display name, or email" /><button onClick={() => void load()}>Search</button></div>
      <div className="table-wrap"><table><thead><tr><th>Account</th><th>Email</th><th>Status</th><th>Created</th><th>Last login</th><th></th></tr></thead><tbody>{accounts.map(account => <tr key={account.id}><td><strong>{account.displayName}</strong><small>@{account.username}</small></td><td>{account.email || '—'}</td><td><span className={`health-pill ${account.isActive ? '' : 'error'}`}>{account.isActive ? 'active' : 'disabled'}</span></td><td>{formatDate(account.createdAt)}</td><td>{formatDate(account.lastLoginAt)}</td><td><button disabled={busyId === account.id} onClick={() => void setActive(account, !account.isActive)}>{account.isActive ? 'Disable' : 'Enable'}</button></td></tr>)}</tbody></table></div>
      {!accounts.length && !error && <EmptyState>No accounts found.</EmptyState>}
    </section>
  </>;
}

export function CommunityPage() {
  const [items, setItems] = useState<Json[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    return getJson(`/v1/cms/community?${params}`)
      .then((data) => { setItems(data); setError(''); })
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => { void load(); }, [status]);

  const remove = async (item: Json) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    await sendJson(`/v1/cms/community/${item.id}`, 'DELETE');
    await load();
  };

  return <>
    <PageHeading kicker="CMS" title="Community"><Link className="button-link primary" to="/cms/community/new">New community item</Link></PageHeading>
    {error && <div className="error-banner">{error}</div>}
    <section className="section">
      <div className="controls"><input type="search" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && load()} placeholder="Search community items" /><select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="open">Open</option><option value="locked">Locked</option><option value="hidden">Hidden</option></select><button onClick={() => void load()}>Refresh</button></div>
      <div className="table-wrap"><table><thead><tr><th>Topic</th><th>Category</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.pinned ? 'Pinned · ' : ''}{item.title}</strong><small>{item.author}</small></td><td>{item.category}</td><td><span className={`health-pill ${item.status === 'open' ? '' : 'warn'}`}>{item.status}</span></td><td>{formatDate(item.updatedAt)}</td><td className="actions"><Link className="table-action" to={`/cms/community/${item.id}/edit`}>Edit</Link><button className="danger" onClick={() => void remove(item)}>Delete</button></td></tr>)}</tbody></table></div>
      {!items.length && <EmptyState>No community items found.</EmptyState>}
    </section>
  </>;
}

export function CommunityEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<Json>({ ...emptyCommunity });
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setForm({ ...emptyCommunity });
      setLoading(false);
      return;
    }
    setLoading(true);
    getJson(`/v1/cms/community/${id}`)
      .then((item) => { setForm(item); setError(''); })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [id]);

  const updateField = (field: string, value: string | boolean) => setForm(current => ({ ...current, [field]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await sendJson(id ? `/v1/cms/community/${id}` : '/v1/cms/community', id ? 'PATCH' : 'POST', form);
      navigate('/cms/community');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return <>
    <BackLink to="/cms/community" label="Back to community" />
    <PageHeading kicker="CMS" title={`${id ? 'Edit' : 'New'} community item`}><span className="caption">Moderation metadata saves with the item</span></PageHeading>
    {error && <div className="error-banner">{error}</div>}
    {loading ? <EmptyState>Loading community item…</EmptyState> : <section className="section editor-page"><form className="editor-form" onSubmit={submit}>
      <div className="form-row"><label>Category<input value={form.category} onChange={event => updateField('category', event.target.value)} /></label><label>Author<input value={form.author} onChange={event => updateField('author', event.target.value)} /></label></div>
      <label>Title<input required value={form.title} onChange={event => updateField('title', event.target.value)} /></label>
      <label>Body<textarea rows={10} value={form.body} onChange={event => updateField('body', event.target.value)} /></label>
      <div className="form-row"><label>Status<select value={form.status} onChange={event => updateField('status', event.target.value)}><option value="open">Open</option><option value="locked">Locked</option><option value="hidden">Hidden</option></select></label><label className="checkbox"><input type="checkbox" checked={form.pinned} onChange={event => updateField('pinned', event.target.checked)} /> Pinned</label></div>
      <div className="form-actions"><Link className="button-link" to="/cms/community">Cancel</Link><button className="primary" type="submit">{id ? 'Save changes' : 'Create item'}</button></div>
    </form></section>}
  </>;
}

function BackLink({ to, label }: { to: string; label: string }) {
  return <Link className="back-link" to={to}><span aria-hidden="true">←</span> {label}</Link>;
}
