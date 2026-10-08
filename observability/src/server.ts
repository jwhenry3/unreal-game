import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { extname, relative, resolve, sep } from 'node:path';
import chokidar from 'chokidar';
import { CmsService, handleCmsRequest } from './cms';

interface TelemetryInput {
  kind?: string;
  service?: string;
  level?: string;
  name?: string;
  message?: string;
  attributes?: Record<string, unknown>;
  timestamp?: string;
}

interface StoredEvent extends Required<Omit<TelemetryInput, 'attributes'>> {
  id: number;
  attributes: Record<string, unknown>;
}

const host = process.env.OBSERVABILITY_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.OBSERVABILITY_PORT ?? '4100', 10);
const apiKey = process.env.OBSERVABILITY_API_KEY ?? 'local-observability-key';
const retentionDays = Math.max(1, Number.parseInt(process.env.OBSERVABILITY_RETENTION_DAYS ?? '7', 10));
const projectRoot = resolve(process.env.OBSERVABILITY_PROJECT_ROOT ?? resolve(process.cwd(), '..'));
const databasePath = resolve(process.env.OBSERVABILITY_DATABASE_PATH ?? './data/observability.sqlite');
const cmsDatabasePath = resolve(process.env.CMS_DATABASE_PATH ?? './data/cms.sqlite');
const cmsBackendUrl = process.env.CMS_BACKEND_URL;
const cmsBackendServiceKey = process.env.CMS_BACKEND_SERVICE_KEY;
const publicRoot = resolve(process.cwd(), 'web-dist');
const clients = new Set<ServerResponse>();
const logOffsets = new Map<string, number>();
const logRemainders = new Map<string, string>();
const logTails = new Map<string, string[]>();
const maxLogLines = Math.max(100, Number.parseInt(process.env.OBSERVABILITY_LOG_TAIL_LINES ?? '500', 10));
const maxLogReadBytes = 64 * 1024;
const sensitiveKey = /(authorization|cookie|password|secret|token|api[-_]?key)/i;
const architecture = {
  layers: [
    { id: 'clients', label: 'Unreal + Web UI', detail: 'Login, registration, character and gameplay requests' },
    { id: 'http', label: 'NestJS HTTP', detail: 'Helmet, CORS, validation, throttling and global telemetry' },
    { id: 'domains', label: 'Domain Modules', detail: 'Auth, Characters, Inventory, Mail, Housing and Auction' },
    { id: 'platform', label: 'Platform Services', detail: 'Persistence, domain events and internal service APIs' },
    { id: 'storage', label: 'SQLite / TypeORM', detail: 'Migrations, entities and transactional state' },
    { id: 'observer', label: 'Observability', detail: 'Batched telemetry, health heartbeats and file watcher' },
  ],
  modules: [
    { name: 'Auth', responsibility: 'Registration, login, refresh and token verification', exposure: 'Public + internal' },
    { name: 'Characters', responsibility: 'Character ownership, creation and jobs', exposure: 'Authenticated' },
    { name: 'Inventory', responsibility: 'Items, equipment and currency', exposure: 'Authenticated + internal' },
    { name: 'Mail', responsibility: 'Mailbox delivery, claiming and expiry', exposure: 'Authenticated + internal' },
    { name: 'Housing', responsibility: 'Plots, houses and furnishings', exposure: 'Authenticated + internal' },
    { name: 'Auction', responsibility: 'Listings, bids, buyout and expiry', exposure: 'Public + authenticated' },
    { name: 'Persistence', responsibility: 'Generic scoped game state', exposure: 'Internal' },
    { name: 'Events', responsibility: 'Durable domain-event outbox', exposure: 'Internal' },
  ],
};

mkdirSync(resolve(databasePath, '..'), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS telemetry_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    service TEXT NOT NULL,
    level TEXT NOT NULL,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    attributes TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_telemetry_kind ON telemetry_events(kind);
  CREATE INDEX IF NOT EXISTS idx_telemetry_level ON telemetry_events(level);
`);

const insertEvent = database.prepare(`
  INSERT INTO telemetry_events (kind, service, level, name, message, attributes, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const cms = new CmsService(cmsDatabasePath, cmsBackendUrl, cmsBackendServiceKey);

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [key, sensitiveKey.test(key) ? '[redacted]' : sanitize(item, depth + 1)]),
    );
  }
  if (typeof value === 'string') return value.slice(0, 8_192);
  return value;
}

function store(input: TelemetryInput): StoredEvent {
  const timestamp = input.timestamp && !Number.isNaN(Date.parse(input.timestamp))
    ? new Date(input.timestamp).toISOString()
    : new Date().toISOString();
  const event = {
    kind: (input.kind ?? 'event').slice(0, 64),
    service: (input.service ?? 'unknown').slice(0, 128),
    level: (input.level ?? 'info').slice(0, 16),
    name: (input.name ?? 'unnamed').slice(0, 128),
    message: (input.message ?? '').slice(0, 8_192),
    attributes: sanitize(input.attributes ?? {}) as Record<string, unknown>,
    timestamp,
  };
  const result = insertEvent.run(
    event.kind,
    event.service,
    event.level,
    event.name,
    event.message,
    JSON.stringify(event.attributes),
    event.timestamp,
  );
  const stored = { id: Number(result.lastInsertRowid), ...event };
  const frame = `data: ${JSON.stringify(stored)}\n\n`;
  for (const client of clients) client.write(frame);
  return stored;
}

function broadcastLog(path: string, lines: string[], reset = false): void {
  const frame = `event: log\ndata: ${JSON.stringify({ path, lines, reset })}\n\n`;
  for (const client of clients) client.write(frame);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 256 * 1024) throw new Error('Request body exceeds 256 KiB.');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function serveStatic(pathname: string, response: ServerResponse): void {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const requestedPath = resolve(publicRoot, requested);
  if (!requestedPath.startsWith(`${publicRoot}${sep}`)) {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }
  const path = existsSync(requestedPath) && statSync(requestedPath).isFile()
    ? requestedPath
    : resolve(publicRoot, 'index.html');
  if (!existsSync(path)) {
    sendJson(response, 503, { error: 'Dashboard has not been built.' });
    return;
  }
  const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  response.writeHead(200, {
    'content-type': contentTypes[extname(path)] ?? 'application/octet-stream',
    'cache-control': extname(path) === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  });
  createReadStream(path).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);
  try {
    if (url.pathname.startsWith('/v1/cms')) {
      await handleCmsRequest(cms, request, response, url, (name, message, attributes) => store({
        kind: 'cms',
        service: 'cms',
        level: 'info',
        name,
        message,
        attributes,
      }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/v1/events') {
      if (request.headers['x-observability-key'] !== apiKey) {
        sendJson(response, 401, { error: 'Invalid observability key.' });
        return;
      }
      const body = await readJson(request);
      const inputs = Array.isArray(body) ? body : [body];
      if (inputs.length > 100 || inputs.some((item) => !item || typeof item !== 'object')) {
        sendJson(response, 400, { error: 'Expected one event or an array of up to 100 events.' });
        return;
      }
      sendJson(response, 202, { accepted: inputs.map((item) => store(item as TelemetryInput).id) });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/events') {
      const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '200', 10)));
      const kind = url.searchParams.get('kind');
      const level = url.searchParams.get('level');
      const search = url.searchParams.get('search');
      const clauses: string[] = kind ? [] : ["kind != 'log'"];
      const values: (string | number)[] = [];
      if (kind) { clauses.push('kind = ?'); values.push(kind); }
      if (level) { clauses.push('level = ?'); values.push(level); }
      if (search) { clauses.push('(name LIKE ? OR message LIKE ? OR attributes LIKE ?)'); values.push(...Array(3).fill(`%${search}%`)); }
      const rows = database.prepare(`
        SELECT id, kind, service, level, name, message, attributes, timestamp
        FROM telemetry_events ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY timestamp DESC LIMIT ?
      `).all(...values, limit) as Array<Omit<StoredEvent, 'attributes'> & { attributes: string }>;
      sendJson(response, 200, rows.map((row) => ({ ...row, attributes: JSON.parse(row.attributes) })));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/summary') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const total = database.prepare('SELECT COUNT(*) AS count FROM telemetry_events WHERE timestamp >= ?').get(since) as { count: number };
      const errors = database.prepare("SELECT COUNT(*) AS count FROM telemetry_events WHERE timestamp >= ? AND level IN ('error', 'fatal')").get(since) as { count: number };
      const files = database.prepare("SELECT COUNT(*) AS count FROM telemetry_events WHERE timestamp >= ? AND kind IN ('file', 'log')").get(since) as { count: number };
      const services = database.prepare('SELECT COUNT(DISTINCT service) AS count FROM telemetry_events WHERE timestamp >= ?').get(since) as { count: number };
      sendJson(response, 200, { total: total.count, errors: errors.count, files: files.count, services: services.count });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/backend-health') {
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const heartbeat = database.prepare(`
        SELECT attributes, timestamp FROM telemetry_events
        WHERE kind = 'health' AND name = 'backend.heartbeat'
        ORDER BY timestamp DESC LIMIT 1
      `).get() as { attributes: string; timestamp: string } | undefined;
      const requestTotals = database.prepare(`
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN CAST(json_extract(attributes, '$.statusCode') AS INTEGER) >= 500 THEN 1 ELSE 0 END) AS errors,
          ROUND(AVG(CAST(json_extract(attributes, '$.durationMs') AS REAL)), 2) AS averageDurationMs,
          ROUND(MAX(CAST(json_extract(attributes, '$.durationMs') AS REAL)), 2) AS maximumDurationMs
        FROM telemetry_events WHERE kind = 'request' AND timestamp >= ?
      `).get(since) as { total: number; errors: number | null; averageDurationMs: number | null; maximumDurationMs: number | null };
      const routes = database.prepare(`
        SELECT name, COUNT(*) AS requests,
          SUM(CASE WHEN CAST(json_extract(attributes, '$.statusCode') AS INTEGER) >= 400 THEN 1 ELSE 0 END) AS failures,
          ROUND(AVG(CAST(json_extract(attributes, '$.durationMs') AS REAL)), 2) AS averageDurationMs,
          ROUND(MAX(CAST(json_extract(attributes, '$.durationMs') AS REAL)), 2) AS maximumDurationMs
        FROM telemetry_events WHERE kind = 'request' AND timestamp >= ?
        GROUP BY name ORDER BY requests DESC, name ASC LIMIT 25
      `).all(since);
      const lastSeenAt = heartbeat?.timestamp;
      const online = Boolean(lastSeenAt && Date.now() - Date.parse(lastSeenAt) < 30_000);
      sendJson(response, 200, {
        status: online ? 'healthy' : heartbeat ? 'offline' : 'unknown',
        lastSeenAt,
        heartbeat: heartbeat ? JSON.parse(heartbeat.attributes) : null,
        requests: {
          windowMinutes: 15,
          total: requestTotals.total,
          errors: requestTotals.errors ?? 0,
          averageDurationMs: requestTotals.averageDurationMs ?? 0,
          maximumDurationMs: requestTotals.maximumDurationMs ?? 0,
        },
        routes,
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/metrics') {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const heartbeats = database.prepare(`
        SELECT timestamp,
          CAST(json_extract(attributes, '$.databaseLatencyMs') AS REAL) AS databaseLatencyMs,
          CAST(json_extract(attributes, '$.heapUsedBytes') AS INTEGER) AS heapUsedBytes,
          CAST(json_extract(attributes, '$.rssBytes') AS INTEGER) AS rssBytes,
          CAST(json_extract(attributes, '$.telemetryQueueDepth') AS INTEGER) AS telemetryQueueDepth
        FROM telemetry_events
        WHERE kind = 'health' AND name = 'backend.heartbeat' AND timestamp >= ?
        ORDER BY timestamp ASC
      `).all(since);
      const requests = database.prepare(`
        SELECT strftime('%Y-%m-%dT%H:%M:00Z', timestamp) AS timestamp,
          COUNT(*) AS requests,
          SUM(CASE WHEN CAST(json_extract(attributes, '$.statusCode') AS INTEGER) >= 500 THEN 1 ELSE 0 END) AS errors,
          ROUND(AVG(CAST(json_extract(attributes, '$.durationMs') AS REAL)), 2) AS averageDurationMs
        FROM telemetry_events
        WHERE kind = 'request' AND timestamp >= ?
        GROUP BY strftime('%Y-%m-%dT%H:%M:00Z', timestamp)
        ORDER BY timestamp ASC
      `).all(since);
      sendJson(response, 200, { windowMinutes: 30, heartbeats, requests });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/architecture') {
      sendJson(response, 200, architecture);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/logs') {
      const requestedPath = url.searchParams.get('path');
      const files = [...logTails.keys()].sort();
      const selectedPath = requestedPath && logTails.has(requestedPath) ? requestedPath : files[0];
      sendJson(response, 200, {
        files,
        selectedPath: selectedPath ?? null,
        lines: selectedPath ? logTails.get(selectedPath) ?? [] : [],
        maxLines: maxLogLines,
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/v1/stream') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      response.write(': connected\n\n');
      clients.add(response);
      request.on('close', () => clients.delete(response));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { status: 'ok', watchedRoot: projectRoot });
      return;
    }

    if (request.method === 'GET') {
      serveStatic(url.pathname, response);
      return;
    }
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request.' });
  }
});

function parseWatchPaths(): string[] {
  const configured = (process.env.OBSERVABILITY_WATCH_PATHS ?? 'backend/logs;Saved/Logs')
    .split(';')
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) => resolve(projectRoot, path));
  return configured.filter((path) => path === projectRoot || path.startsWith(`${projectRoot}${sep}`));
}

function redactLogLine(line: string): string {
  return line
    .slice(0, 4_096)
    .replace(/(authorization|token|secret|password|api[-_]?key)(\s*[:=]\s*)\S+/gi, '$1$2[redacted]');
}

async function tailLog(path: string): Promise<void> {
  if (!existsSync(path)) return;
  const projectPath = relative(projectRoot, path).replaceAll('\\', '/');
  const size = statSync(path).size;
  const previousOffset = logOffsets.get(path);
  const reset = previousOffset === undefined || size < previousOffset;
  const start = reset ? Math.max(0, size - maxLogReadBytes) : previousOffset;
  const bytesToRead = Math.min(size - start, maxLogReadBytes);
  logOffsets.set(path, size);
  if (bytesToRead <= 0) return;

  const handle = await open(path, 'r');
  const buffer = Buffer.alloc(bytesToRead);
  try {
    await handle.read(buffer, 0, bytesToRead, start);
  } finally {
    await handle.close();
  }

  const chunk = `${reset ? '' : logRemainders.get(path) ?? ''}${buffer.toString('utf8')}`;
  const parts = chunk.split(/\r?\n/);
  logRemainders.set(path, parts.pop() ?? '');
  if (reset && start > 0) parts.shift();
  const appended = parts.map(redactLogLine).filter(Boolean);
  const existing = reset ? [] : logTails.get(projectPath) ?? [];
  const next = [...existing, ...appended].slice(-maxLogLines);
  logTails.set(projectPath, next);
  if (appended.length > 0) broadcastLog(projectPath, appended, reset);
}

async function recordFile(action: string, path: string): Promise<void> {
  const projectPath = relative(projectRoot, path).replaceAll('\\', '/');
  if (extname(path).toLowerCase() === '.log') {
    if (action === 'unlink') {
      logOffsets.delete(path);
      logRemainders.delete(path);
      logTails.delete(projectPath);
      broadcastLog(projectPath, [], true);
      return;
    }
    await tailLog(path);
    return;
  }
  const attributes: Record<string, unknown> = { action, path: projectPath };
  if (action !== 'unlink' && existsSync(path)) {
    const stats = statSync(path);
    attributes.size = stats.size;
    attributes.modifiedAt = stats.mtime.toISOString();
  }
  store({
    kind: 'file',
    service: 'file-watcher',
    level: 'info',
    name: `file.${action}`,
    message: `${action}: ${projectPath}`,
    attributes,
  });
}

const watcher = chokidar.watch(parseWatchPaths(), {
  ignoreInitial: false,
  awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  ignored: (path) => path.includes(`${sep}node_modules${sep}`)
    || path.includes(`${sep}.git${sep}`)
    || /-backup-[^/\\]+\.log$/i.test(path),
});
watcher.on('add', (path) => void recordFile('add', path));
watcher.on('change', (path) => void recordFile('change', path));
watcher.on('unlink', (path) => void recordFile('unlink', path));
watcher.on('error', (error) => store({ kind: 'system', service: 'file-watcher', level: 'error', name: 'watcher.error', message: String(error) }));

const cleanup = (): void => {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  database.prepare('DELETE FROM telemetry_events WHERE timestamp < ?').run(cutoff);
};
cleanup();
const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
cleanupTimer.unref();

server.listen(port, host, () => {
  console.log(`Observability dashboard: http://${host}:${port}`);
  console.log(`Watching: ${parseWatchPaths().join(', ') || '(none)'}`);
});

async function shutdown(): Promise<void> {
  clearInterval(cleanupTimer);
  await watcher.close();
  for (const client of clients) client.end();
  server.close(() => {
    database.close();
    cms.close();
    process.exit(0);
  });
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
