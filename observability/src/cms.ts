import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

type ContentType = 'post' | 'update';
type ContentStatus = 'draft' | 'published' | 'archived';
type CommunityStatus = 'open' | 'locked' | 'hidden';
type JsonObject = Record<string, unknown>;
type ActivityRecorder = (name: string, message: string, attributes?: JsonObject) => void;

const contentTypes = new Set<ContentType>(['post', 'update']);
const contentStatuses = new Set<ContentStatus>(['draft', 'published', 'archived']);
const communityStatuses = new Set<CommunityStatus>(['open', 'locked', 'hidden']);

export class CmsService {
  private readonly database: DatabaseSync;

  constructor(
    databasePath: string,
    private readonly backendUrl: string | undefined,
    private readonly backendServiceKey: string | undefined,
  ) {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
    this.database = new DatabaseSync(resolve(databasePath));
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS cms_content (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('post', 'update')),
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        tags TEXT NOT NULL DEFAULT '[]',
        version TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        published_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(type, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_cms_content_type_status ON cms_content(type, status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS cms_community_items (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'hidden')),
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cms_community_status ON cms_community_items(status, pinned DESC, updated_at DESC);
    `);
  }

  close(): void {
    this.database.close();
  }

  overview(): JsonObject {
    const count = (sql: string, ...values: string[]) =>
      (this.database.prepare(sql).get(...values) as { count: number }).count;
    return {
      posts: {
        total: count("SELECT COUNT(*) AS count FROM cms_content WHERE type = 'post'"),
        published: count("SELECT COUNT(*) AS count FROM cms_content WHERE type = 'post' AND status = 'published'"),
      },
      updates: {
        total: count("SELECT COUNT(*) AS count FROM cms_content WHERE type = 'update'"),
        published: count("SELECT COUNT(*) AS count FROM cms_content WHERE type = 'update' AND status = 'published'"),
      },
      community: {
        total: count('SELECT COUNT(*) AS count FROM cms_community_items'),
        open: count("SELECT COUNT(*) AS count FROM cms_community_items WHERE status = 'open'"),
        pinned: count('SELECT COUNT(*) AS count FROM cms_community_items WHERE pinned = 1'),
      },
      accounts: {
        backendConfigured: Boolean(this.backendUrl && this.backendServiceKey),
        backendUrl: this.backendUrl ?? null,
      },
    };
  }

  getContent(id: string): JsonObject | null {
    const row = this.getRawContent(id);
    return row ? contentRecord(row) : null;
  }

  listContent(type: ContentType, status?: string, search?: string): JsonObject[] {
    const clauses = ['type = ?'];
    const values: string[] = [type];
    if (status && contentStatuses.has(status as ContentStatus)) {
      clauses.push('status = ?');
      values.push(status);
    }
    if (search) {
      clauses.push('(LOWER(title) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(body) LIKE ? OR LOWER(slug) LIKE ?)');
      values.push(...Array(4).fill(`%${search.toLowerCase()}%`));
    }
    const rows = this.database.prepare(`
      SELECT * FROM cms_content WHERE ${clauses.join(' AND ')}
      ORDER BY COALESCE(published_at, updated_at) DESC LIMIT 200
    `).all(...values) as JsonObject[];
    return rows.map(contentRecord);
  }

  createContent(input: JsonObject): JsonObject {
    const type = stringValue(input.type, 'post') as ContentType;
    const title = requiredText(input.title, 'title', 160);
    if (!contentTypes.has(type)) throw new Error('type must be post or update.');
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const status = normalizeContentStatus(input.status);
    const record = {
      id,
      type,
      slug: uniqueSlug(this.database, type, slugify(stringValue(input.slug, '') || title), id),
      title,
      summary: stringValue(input.summary, '', 500),
      body: stringValue(input.body, '', 50_000),
      status,
      tags: JSON.stringify(normalizeTags(input.tags)),
      version: stringValue(input.version, '', 64),
      channel: stringValue(input.channel, '', 64),
      author: stringValue(input.author, '', 128),
      published_at: status === 'published' ? timestamp : null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.database.prepare(`
      INSERT INTO cms_content (id, type, slug, title, summary, body, status, tags, version, channel, author, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.type, record.slug, record.title, record.summary, record.body, record.status,
      record.tags, record.version, record.channel, record.author, record.published_at,
      record.created_at, record.updated_at,
    );
    return contentRecord(record);
  }

  updateContent(id: string, input: JsonObject): JsonObject | null {
    const existing = this.getRawContent(id);
    if (!existing) return null;
    const next = { ...existing } as Record<string, string | number | null>;
    if (input.title !== undefined) next.title = requiredText(input.title, 'title', 160);
    if (input.slug !== undefined) next.slug = uniqueSlug(this.database, String(existing.type), slugify(stringValue(input.slug, '') || String(next.title)), id);
    if (input.summary !== undefined) next.summary = stringValue(input.summary, '', 500);
    if (input.body !== undefined) next.body = stringValue(input.body, '', 50_000);
    if (input.status !== undefined) next.status = normalizeContentStatus(input.status);
    if (input.tags !== undefined) next.tags = JSON.stringify(normalizeTags(input.tags));
    if (input.version !== undefined) next.version = stringValue(input.version, '', 64);
    if (input.channel !== undefined) next.channel = stringValue(input.channel, '', 64);
    if (input.author !== undefined) next.author = stringValue(input.author, '', 128);
    next.updated_at = new Date().toISOString();
    next.published_at = next.status === 'published' ? String(existing.published_at ?? next.updated_at) : null;

    this.database.prepare(`
      UPDATE cms_content SET slug = ?, title = ?, summary = ?, body = ?, status = ?, tags = ?,
        version = ?, channel = ?, author = ?, published_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.slug, next.title, next.summary, next.body, next.status, next.tags, next.version,
      next.channel, next.author, next.published_at, next.updated_at, id,
    );
    return contentRecord(this.getRawContent(id)!);
  }

  deleteContent(id: string): boolean {
    return this.database.prepare('DELETE FROM cms_content WHERE id = ?').run(id).changes > 0;
  }

  getCommunity(id: string): JsonObject | null {
    const row = this.database.prepare('SELECT * FROM cms_community_items WHERE id = ?').get(id) as JsonObject | undefined;
    return row ? communityRecord(row) : null;
  }

  listCommunity(status?: string, search?: string): JsonObject[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (status && communityStatuses.has(status as CommunityStatus)) {
      clauses.push('status = ?');
      values.push(status);
    }
    if (search) {
      clauses.push('(LOWER(title) LIKE ? OR LOWER(body) LIKE ? OR LOWER(category) LIKE ? OR LOWER(author) LIKE ?)');
      values.push(...Array(4).fill(`%${search.toLowerCase()}%`));
    }
    const rows = this.database.prepare(`
      SELECT * FROM cms_community_items ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY pinned DESC, updated_at DESC LIMIT 200
    `).all(...values) as JsonObject[];
    return rows.map(communityRecord);
  }

  createCommunity(input: JsonObject): JsonObject {
    const timestamp = new Date().toISOString();
    const record = {
      id: randomUUID(),
      category: stringValue(input.category, 'general', 64),
      title: requiredText(input.title, 'title', 160),
      body: stringValue(input.body, '', 20_000),
      author: stringValue(input.author, 'community-team', 128),
      status: normalizeCommunityStatus(input.status),
      pinned: input.pinned === true ? 1 : 0,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.database.prepare(`
      INSERT INTO cms_community_items (id, category, title, body, author, status, pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.category, record.title, record.body, record.author,
      record.status, record.pinned, record.created_at, record.updated_at,
    );
    return communityRecord(record);
  }

  updateCommunity(id: string, input: JsonObject): JsonObject | null {
    const existing = this.database.prepare('SELECT * FROM cms_community_items WHERE id = ?').get(id) as JsonObject | undefined;
    if (!existing) return null;
    const next = { ...existing } as Record<string, string | number>;
    if (input.category !== undefined) next.category = stringValue(input.category, 'general', 64);
    if (input.title !== undefined) next.title = requiredText(input.title, 'title', 160);
    if (input.body !== undefined) next.body = stringValue(input.body, '', 20_000);
    if (input.author !== undefined) next.author = stringValue(input.author, '', 128);
    if (input.status !== undefined) next.status = normalizeCommunityStatus(input.status);
    if (input.pinned !== undefined) next.pinned = input.pinned === true ? 1 : 0;
    next.updated_at = new Date().toISOString();
    this.database.prepare(`
      UPDATE cms_community_items SET category = ?, title = ?, body = ?, author = ?, status = ?, pinned = ?, updated_at = ?
      WHERE id = ?
    `).run(next.category, next.title, next.body, next.author, next.status, next.pinned, next.updated_at, id);
    return communityRecord(this.database.prepare('SELECT * FROM cms_community_items WHERE id = ?').get(id) as JsonObject);
  }

  deleteCommunity(id: string): boolean {
    return this.database.prepare('DELETE FROM cms_community_items WHERE id = ?').run(id).changes > 0;
  }

  async proxyAccounts(method: 'GET' | 'PATCH', request: IncomingMessage, accountId?: string): Promise<ProxyResult> {
    if (!this.backendUrl || !this.backendServiceKey) {
      return { status: 503, body: { error: 'Backend account management is not configured.', configured: false } };
    }
    const upstream = new URL(`${this.backendUrl.replace(/\/$/, '')}/internal/accounts${accountId ? `/${accountId}` : ''}`);
    const search = new URL(request.url ?? '', 'http://localhost').searchParams.get('search');
    if (search) upstream.searchParams.set('search', search);
    const body = method === 'PATCH' ? JSON.stringify(await readJson(request)) : undefined;
    const response = await fetch(upstream, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-service-key': this.backendServiceKey,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    return readProxyResponse(response);
  }

  async proxyAuth(action: 'login' | 'register' | 'refresh' | 'me' | 'logout', request: IncomingMessage): Promise<ProxyResult> {
    if (!this.backendUrl) {
      return { status: 503, body: { error: 'Backend authentication is not configured.', configured: false } };
    }
    const method = action === 'me' ? 'GET' : 'POST';
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const authorization = request.headers.authorization;
    if (authorization) headers.authorization = authorization;
    const body = method === 'POST' ? JSON.stringify(await readJson(request)) : undefined;
    const response = await fetch(`${this.backendUrl.replace(/\/$/, '')}/auth/${action}`, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(5_000),
    });
    return readProxyResponse(response);
  }

  async backendStatus(): Promise<JsonObject> {
    if (!this.backendUrl) {
      return {
        backend: { status: 'unconfigured', online: false },
        realms: [],
        realmStatus: 'unconfigured',
      };
    }
    const base = this.backendUrl.replace(/\/$/, '');
    const [health, servers] = await Promise.all([
      fetchJson(`${base}/health`),
      fetchJson(`${base}/auth/servers`),
    ]);
    const online = health.ok === true && health.body?.status === 'ok';
    const realms = Array.isArray(servers.body?.servers) ? servers.body.servers : [];
    return {
      backend: {
        status: online ? 'online' : 'offline',
        online,
        checkedAt: new Date().toISOString(),
        database: health.body?.database ?? 'unknown',
      },
      realms: realms.map((name: unknown) => ({
        name: String(name),
        status: online ? 'online' : 'unknown',
      })),
      realmStatus: online ? 'online' : 'offline',
    };
  }

  private getRawContent(id: string): JsonObject | undefined {
    return this.database.prepare('SELECT * FROM cms_content WHERE id = ?').get(id) as JsonObject | undefined;
  }
}

interface ProxyResult {
  status: number;
  body: unknown;
}

async function readProxyResponse(response: Response): Promise<ProxyResult> {
  const text = await response.text();
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { error: text.slice(0, 500) };
  }
  return { status: response.status, body: parsed };
}

async function fetchJson(url: string): Promise<{ ok: boolean; body: JsonObject }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    const body = await response.json().catch(() => ({})) as JsonObject;
    return { ok: response.ok, body };
  } catch {
    return { ok: false, body: {} };
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error('Request body exceeds 1 MiB.');
    chunks.push(buffer);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object.');
  return parsed as JsonObject;
}

export async function handleCmsRequest(
  service: CmsService,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  recordActivity: ActivityRecorder,
): Promise<void> {
  const segments = url.pathname.split('/').filter(Boolean).slice(2);
  const resource = segments[0];
  const id = segments[1];

  if (request.method === 'GET' && resource === 'overview') {
    sendJson(response, 200, service.overview());
    return;
  }

  if (request.method === 'GET' && resource === 'status') {
    sendJson(response, 200, await service.backendStatus());
    return;
  }

  if (resource === 'auth') {
    const action = id;
    const allowed = new Set(['login', 'register', 'refresh', 'me', 'logout']);
    if (action && allowed.has(action) && request.method === (action === 'me' ? 'GET' : 'POST')) {
      const result = await service.proxyAuth(action as 'login' | 'register' | 'refresh' | 'me' | 'logout', request);
      sendJson(response, result.status, result.body);
      return;
    }
  }

  const aliasType = resource === 'posts' ? 'post' : resource === 'updates' ? 'update' : undefined;
  if (resource === 'content' || aliasType) {
    const requestedType = (url.searchParams.get('type') || aliasType || 'post') as ContentType;
    if (!contentTypes.has(requestedType)) {
      sendJson(response, 400, { error: 'type must be post or update.' });
      return;
    }
    if (!id && request.method === 'GET') {
      sendJson(response, 200, service.listContent(requestedType, url.searchParams.get('status') ?? undefined, url.searchParams.get('search') ?? undefined));
      return;
    }
    if (id && request.method === 'GET') {
      const content = service.getContent(id);
      if (!content) { sendJson(response, 404, { error: 'Content was not found.' }); return; }
      sendJson(response, 200, content);
      return;
    }
    if (!id && request.method === 'POST') {
      const body = await readJson(request);
      const submittedType = aliasType ?? body.type ?? requestedType;
      if (!contentTypes.has(submittedType as ContentType)) {
        sendJson(response, 400, { error: 'type must be post or update.' });
        return;
      }
      const created = service.createContent({ ...body, type: submittedType });
      recordActivity('cms.content.created', `Created ${created.type} "${created.title}"`, { id: created.id, type: created.type });
      sendJson(response, 201, created);
      return;
    }
    if (id && request.method === 'PATCH') {
      const updated = service.updateContent(id, await readJson(request));
      if (!updated) { sendJson(response, 404, { error: 'Content was not found.' }); return; }
      recordActivity('cms.content.updated', `Updated ${updated.type} "${updated.title}"`, { id, type: updated.type });
      sendJson(response, 200, updated);
      return;
    }
    if (id && request.method === 'DELETE') {
      if (!service.deleteContent(id)) { sendJson(response, 404, { error: 'Content was not found.' }); return; }
      recordActivity('cms.content.deleted', `Deleted CMS content ${id}`, { id });
      sendJson(response, 200, { success: true });
      return;
    }
  }

  if (resource === 'community') {
    if (!id && request.method === 'GET') {
      sendJson(response, 200, service.listCommunity(url.searchParams.get('status') ?? undefined, url.searchParams.get('search') ?? undefined));
      return;
    }
    if (id && request.method === 'GET') {
      const item = service.getCommunity(id);
      if (!item) { sendJson(response, 404, { error: 'Community item was not found.' }); return; }
      sendJson(response, 200, item);
      return;
    }
    if (!id && request.method === 'POST') {
      const created = service.createCommunity(await readJson(request));
      recordActivity('cms.community.created', `Created community item "${created.title}"`, { id: created.id });
      sendJson(response, 201, created);
      return;
    }
    if (id && request.method === 'PATCH') {
      const updated = service.updateCommunity(id, await readJson(request));
      if (!updated) { sendJson(response, 404, { error: 'Community item was not found.' }); return; }
      recordActivity('cms.community.updated', `Updated community item "${updated.title}"`, { id });
      sendJson(response, 200, updated);
      return;
    }
    if (id && request.method === 'DELETE') {
      if (!service.deleteCommunity(id)) { sendJson(response, 404, { error: 'Community item was not found.' }); return; }
      recordActivity('cms.community.deleted', `Deleted community item ${id}`, { id });
      sendJson(response, 200, { success: true });
      return;
    }
  }

  if (resource === 'accounts') {
    if (!id && request.method === 'GET') {
      const result = await service.proxyAccounts('GET', request);
      sendJson(response, result.status, result.body);
      return;
    }
    if (id && request.method === 'PATCH') {
      const result = await service.proxyAccounts('PATCH', request, id);
      if (result.status < 400) {
        recordActivity('cms.account.updated', `Updated account ${id}`, { id });
      }
      sendJson(response, result.status, result.body);
      return;
    }
  }

  sendJson(response, 404, { error: 'Not found' });
}

function contentRecord(row: JsonObject): JsonObject {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    status: row.status,
    tags: JSON.parse(String(row.tags ?? '[]')),
    version: row.version,
    channel: row.channel,
    author: row.author,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function communityRecord(row: JsonObject): JsonObject {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    author: row.author,
    status: row.status,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeContentStatus(value: unknown): ContentStatus {
  const status = stringValue(value, 'draft') as ContentStatus;
  if (!contentStatuses.has(status)) throw new Error('status must be draft, published, or archived.');
  return status;
}

function normalizeCommunityStatus(value: unknown): CommunityStatus {
  const status = stringValue(value, 'open') as CommunityStatus;
  if (!communityStatuses.has(status)) throw new Error('status must be open, locked, or hidden.');
  return status;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((tag) => stringValue(tag, '', 40)).filter(Boolean).slice(0, 12);
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  const text = stringValue(value, '', maxLength).trim();
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function stringValue(value: unknown, fallback = '', maxLength = 10_000): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') return String(value).slice(0, maxLength);
  return value.slice(0, maxLength);
}

function slugify(value: string): string {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
  return slug || 'untitled';
}

function uniqueSlug(database: DatabaseSync, type: string, base: string, id: string): string {
  let slug = base;
  let suffix = 2;
  while (database.prepare('SELECT id FROM cms_content WHERE type = ? AND slug = ? AND id != ?').get(type, slug, id)) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}
