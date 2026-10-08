import React, { createContext, useContext, useEffect, useRef } from 'react';

export type Json = Record<string, any>;

export const StreamContext = createContext<EventSource | null>(null);
export const useStream = () => useContext(StreamContext);

export async function getJson(url: string): Promise<any> {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed with HTTP ${response.status}`);
  return data;
}

export async function sendJson(url: string, method: string, body?: unknown): Promise<any> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Request failed with HTTP ${response.status}`);
  return data;
}

export const formatBytes = (bytes?: number) => Number.isFinite(bytes) ? `${(bytes! / 1048576).toFixed(1)} MB` : '—';
export const formatDuration = (seconds?: number) => Number.isFinite(seconds) ? `${Math.floor(seconds! / 3600)}h ${Math.floor((seconds! % 3600) / 60)}m` : '—';
export const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';

export function PageHeading({ kicker, title, children }: React.PropsWithChildren<{ kicker: string; title: string }>) {
  return <div className="page-heading"><div><span className="kicker">{kicker}</span><h2>{title}</h2></div>{children}</div>;
}

export function Metrics({ items }: { items: Array<[string, React.ReactNode]> }) {
  return <div className="summary">{items.map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

export function Chart({ series, decimals = 0 }: { series: Array<{ label?: string; color?: string; values: number[] }>; decimals?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const element = canvas.current;
      if (!element) return;
      const width = element.clientWidth || 520;
      const height = element.clientHeight || 190;
      const dpr = devicePixelRatio || 1;
      element.width = width * dpr;
      element.height = height * dpr;
      const ctx = element.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      const all = series.flatMap(item => item.values).filter(Number.isFinite);
      const max = Math.max(1, ...all) * 1.12;
      ctx.strokeStyle = '#253044';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const y = 12 + i * (height - 34) / 3;
        ctx.beginPath();
        ctx.moveTo(34, y);
        ctx.lineTo(width - 8, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#718098';
      ctx.font = '9px ui-monospace';
      ctx.fillText(max.toFixed(decimals), 2, 15);
      ctx.fillText('0', 20, height - 18);
      series.forEach((item, index) => {
        if (!item.values.length) return;
        ctx.strokeStyle = item.color || (index ? '#8d78bd' : '#65aee8');
        ctx.lineWidth = 2;
        ctx.beginPath();
        item.values.forEach((value, i) => {
          const x = 35 + i * (width - 47) / Math.max(1, item.values.length - 1);
          const y = height - 20 - value / max * (height - 34);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      });
      if (series.length > 1) series.forEach((item, i) => {
        ctx.fillStyle = item.color || (i ? '#8d78bd' : '#65aee8');
        ctx.fillRect(38 + i * 85, 5, 8, 2);
        ctx.fillStyle = '#8c9aaf';
        ctx.fillText(item.label || '', 50 + i * 85, 9);
      });
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [series, decimals]);
  return <canvas ref={canvas} />;
}

export function ChartCard({ kicker, title, caption, children }: React.PropsWithChildren<{ kicker: string; title: string; caption: string }>) {
  return <article className="chart-card"><div><span className="kicker">{kicker}</span><h3>{title}</h3></div>{children}<span className="chart-caption">{caption}</span></article>;
}

export function EmptyState({ children }: React.PropsWithChildren) {
  return <div className="empty-state">{children}</div>;
}
