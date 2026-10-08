import React, { useEffect, useRef, useState } from 'react';
import { Chart, ChartCard, EmptyState, formatBytes, formatDuration, getJson, Json, Metrics, PageHeading, useStream } from './shared';

export function HealthPage() {
  const [health, setHealth] = useState<Json>();
  const [summary, setSummary] = useState<Json>();
  const [metrics, setMetrics] = useState<Json>();

  useEffect(() => {
    const load = () => Promise.all(['/v1/backend-health', '/v1/summary', '/v1/metrics'].map(getJson))
      .then(([nextHealth, nextSummary, nextMetrics]) => {
        setHealth(nextHealth);
        setSummary(nextSummary);
        setMetrics(nextMetrics);
      });
    void load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, []);

  const heartbeat = health?.heartbeat || {};
  const requests = health?.requests || {};
  const signals = [
    ['Database', heartbeat.database || 'Unknown'],
    ['Database latency', heartbeat.databaseLatencyMs == null ? '—' : `${heartbeat.databaseLatencyMs} ms`],
    ['Process uptime', formatDuration(heartbeat.uptimeSeconds)],
    ['Heap usage', heartbeat.heapUsedBytes == null ? '—' : `${formatBytes(heartbeat.heapUsedBytes)} / ${formatBytes(heartbeat.heapTotalBytes)}`],
    ['Resident memory', formatBytes(heartbeat.rssBytes)],
    ['Telemetry queue', heartbeat.telemetryQueueDepth == null ? '—' : `${heartbeat.telemetryQueueDepth} events`],
    ['Node runtime', heartbeat.nodeVersion || '—'],
    ['Process ID', heartbeat.processId || '—'],
  ];

  return <>
    <PageHeading kicker="OBSERVABILITY" title="Backend health">
      <div className="heartbeat-state"><span className={`pulse ${health?.status || 'unknown'}`} /><span className={`status ${health?.status || 'unknown'}`}>{health?.status || 'Unknown'}</span></div>
    </PageHeading>
    <Metrics items={[['Events · 24h', summary?.total ?? '—'], ['Errors · 24h', summary?.errors ?? '—'], ['File signals', summary?.files ?? '—'], ['Active services', summary?.services ?? '—']]} />
    <section className="section health-layout">
      <div>
        <div className="section-heading"><h2>Current signals</h2><span className="caption">{health?.lastSeenAt ? `Last heartbeat ${new Date(health.lastSeenAt).toLocaleTimeString()}` : 'No heartbeat received'}</span></div>
        <div className="health-list">{signals.map(([label, value]) => <div className="health-item" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      </div>
      <div className="request-card"><span className="kicker">LAST 15 MINUTES</span><h3>Request performance</h3><Metrics items={[['Requests', requests.total ?? 0], ['Server errors', requests.errors ?? 0], ['Average latency', `${requests.averageDurationMs ?? 0} ms`], ['Maximum latency', `${requests.maximumDurationMs ?? 0} ms`]]} /></div>
    </section>
    {metrics && <section className="chart-grid">
      <ChartCard kicker="HEARTBEAT" title="Database latency" caption="Milliseconds · last 30 minutes"><Chart decimals={1} series={[{ values: metrics.heartbeats.map((x: Json) => x.databaseLatencyMs) }]} /></ChartCard>
      <ChartCard kicker="PROCESS" title="Memory usage" caption="Megabytes · heap and RSS · last 30 minutes"><Chart series={[{ label: 'Heap', color: '#65aee8', values: metrics.heartbeats.map((x: Json) => x.heapUsedBytes / 1048576) }, { label: 'RSS', color: '#8d78bd', values: metrics.heartbeats.map((x: Json) => x.rssBytes / 1048576) }]} /></ChartCard>
      <ChartCard kicker="HTTP" title="Request volume" caption="Requests per minute · last 30 minutes"><Chart series={[{ values: metrics.requests.map((x: Json) => x.requests) }]} /></ChartCard>
      <ChartCard kicker="HTTP" title="Average latency" caption="Milliseconds per minute · last 30 minutes"><Chart decimals={1} series={[{ values: metrics.requests.map((x: Json) => x.averageDurationMs) }]} /></ChartCard>
    </section>}
  </>;
}

export function ArchitecturePage() {
  const [data, setData] = useState<Json>();
  useEffect(() => { void getJson('/v1/architecture').then(setData); }, []);
  return <>
    <PageHeading kicker="OBSERVABILITY" title="NestJS architecture"><span className="caption">Request and telemetry flow</span></PageHeading>
    {data && <>
      <section className="section"><div className="architecture-flow">{data.layers.map((layer: Json, i: number) => <React.Fragment key={layer.id}><div className={`arch-node ${layer.id}`}><strong>{layer.label}</strong><span>{layer.detail}</span></div>{i < data.layers.length - 1 && <div className="arch-arrow">→</div>}</React.Fragment>)}</div></section>
      <section className="section"><div className="section-heading"><h2>Domain modules</h2><span className="caption">Responsibilities and exposure</span></div><div className="table-wrap"><table><thead><tr><th>Module</th><th>Responsibility</th><th>Exposure</th></tr></thead><tbody>{data.modules.map((module: Json) => <tr key={module.name}><td>{module.name}</td><td>{module.responsibility}</td><td>{module.exposure}</td></tr>)}</tbody></table></div></section>
    </>}
  </>;
}

export function RoutesPage() {
  const [data, setData] = useState<Json>();
  useEffect(() => {
    const load = () => void getJson('/v1/backend-health').then(setData);
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, []);
  const request = data?.requests || {};
  return <>
    <PageHeading kicker="OBSERVABILITY" title="Route health"><span className="caption">Rolling {request.windowMinutes ?? 15}-minute window</span></PageHeading>
    <Metrics items={[['Requests', request.total ?? 0], ['Server errors', request.errors ?? 0], ['Average latency', `${request.averageDurationMs ?? 0} ms`], ['Maximum latency', `${request.maximumDurationMs ?? 0} ms`]]} />
    <section className="section"><div className="table-wrap"><table><thead><tr><th>Route</th><th>Requests</th><th>Failures</th><th>Avg latency</th><th>Max latency</th><th>Health</th></tr></thead><tbody>{(data?.routes || []).map((route: Json) => {
      const rate = route.requests ? route.failures / route.requests : 0;
      const state = rate >= .1 ? 'error' : rate > 0 || route.averageDurationMs >= 500 ? 'warn' : 'healthy';
      return <tr key={route.name}><td>{route.name}</td><td>{route.requests}</td><td>{route.failures}</td><td>{route.averageDurationMs} ms</td><td>{route.maximumDurationMs} ms</td><td><span className={`health-pill ${state === 'healthy' ? '' : state}`}>{state}</span></td></tr>;
    })}</tbody></table></div></section>
  </>;
}

export function LogsPage() {
  const stream = useStream();
  const [files, setFiles] = useState<string[]>([]);
  const [path, setPath] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [maxLines, setMaxLines] = useState(500);
  const [follow, setFollow] = useState(true);
  const output = useRef<HTMLPreElement>(null);
  const load = (selected = '') => void getJson(`/v1/logs${selected ? `?path=${encodeURIComponent(selected)}` : ''}`).then(data => {
    setFiles(data.files);
    setPath(data.selectedPath || '');
    setLines(data.lines);
    setMaxLines(data.maxLines);
  });

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!stream) return;
    const listener = (event: Event) => {
      const update = JSON.parse((event as MessageEvent).data);
      if (!path) return load(update.path);
      if (update.path === path) setLines(current => (update.reset ? update.lines : [...current, ...update.lines]).slice(-maxLines));
    };
    stream.addEventListener('log', listener);
    return () => stream.removeEventListener('log', listener);
  }, [stream, path, maxLines]);
  useEffect(() => { if (follow && output.current) output.current.scrollTop = output.current.scrollHeight; }, [lines, follow]);

  return <>
    <PageHeading kicker="OBSERVABILITY" title="Log tail"><span className="caption">{path ? `${lines.length} / ${maxLines} lines` : 'Waiting for log output'}</span></PageHeading>
    <section className="section"><div className="log-toolbar"><select value={path} onChange={event => load(event.target.value)}>{files.length ? files.map(file => <option key={file}>{file}</option>) : <option>No log files detected</option>}</select><label><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)} /> Follow output</label><button onClick={() => setLines([])}>Clear view</button></div><pre ref={output} className="log-output">{lines.length ? lines.map((line, i) => <span className={`log-line ${/\b(error|fatal)\b/i.test(line) ? 'error' : /\bwarn/i.test(line) ? 'warn' : ''}`} key={i}>{line}</span>) : <span className="log-placeholder">{path ? 'Waiting for new lines.' : 'No watched logs detected.'}</span>}</pre></section>
  </>;
}

export function EventsPage() {
  const stream = useStream();
  const [events, setEvents] = useState<Json[]>([]);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [level, setLevel] = useState('');
  const [open, setOpen] = useState<number>();
  const load = () => {
    const params = new URLSearchParams({ limit: '300' });
    if (search) params.set('search', search);
    if (kind) params.set('kind', kind);
    if (level) params.set('level', level);
    void getJson(`/v1/events?${params}`).then(setEvents);
  };

  useEffect(load, [kind, level]);
  useEffect(() => {
    if (!stream) return;
    const listener = (event: MessageEvent) => setEvents(current => [JSON.parse(event.data), ...current].slice(0, 300));
    stream.addEventListener('message', listener as EventListener);
    return () => stream.removeEventListener('message', listener as EventListener);
  }, [stream]);

  return <>
    <PageHeading kicker="OBSERVABILITY" title="Event stream"><span className="caption">{events.length} events</span></PageHeading>
    <section className="section"><div className="controls"><input type="search" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && load()} placeholder="Search events, messages, attributes" /><select value={kind} onChange={event => setKind(event.target.value)}><option value="">All kinds</option>{['request','health','domain','event','file','system','cms'].map(value => <option key={value}>{value}</option>)}</select><select value={level} onChange={event => setLevel(event.target.value)}><option value="">All levels</option>{['info','warn','error','fatal'].map(value => <option key={value}>{value}</option>)}</select><button onClick={load}>Refresh</button></div><div className="events">{events.length ? events.map(event => <article className={`event ${open === event.id ? 'open' : ''}`} key={event.id} onClick={() => setOpen(open === event.id ? undefined : event.id)}><div className="event-time">{new Date(event.timestamp).toLocaleString()}</div><div><div className="event-heading"><span className={`event-level ${event.level}`}>{event.level}</span><strong>{event.kind} / {event.name}</strong><span className="event-service">{event.service}</span></div><p className="event-message">{event.message || '—'}</p><pre className="event-attributes">{JSON.stringify(event.attributes, null, 2)}</pre></div></article>) : <EmptyState>No events match the current filters.</EmptyState>}</div></section>
  </>;
}
