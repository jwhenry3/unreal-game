import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { AccountsPage, CommunityEditorPage, CommunityPage, CmsDashboardPage, PostEditorPage, PostsPage, UpdateEditorPage, UpdatesPage } from './cms';
import { ArchitecturePage, EventsPage, HealthPage, LogsPage, RoutesPage } from './observability';
import { StreamContext } from './shared';
import './styles.css';

function Layout() {
  const [connected, setConnected] = useState(false);
  const [stream] = useState(() => new EventSource('/v1/stream'));

  useEffect(() => {
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    return () => stream.close();
  }, [stream]);

  return <StreamContext.Provider value={stream}>
    <header>
      <div className="brand"><span className="eyebrow">MYGAME OPERATIONS</span><h1>CMS + Observability</h1></div>
      <nav aria-label="Primary">
        <div className="nav-group"><span>CMS</span><NavLink to="/cms" end>Overview</NavLink><NavLink to="/cms/posts">Posts</NavLink><NavLink to="/cms/updates">Updates</NavLink><NavLink to="/cms/accounts">Accounts</NavLink><NavLink to="/cms/community">Community</NavLink></div>
        <div className="nav-group"><span>Observability</span><NavLink to="/observability" end>Health</NavLink><NavLink to="/observability/architecture">Architecture</NavLink><NavLink to="/observability/routes">Routes</NavLink><NavLink to="/observability/logs">Logs</NavLink><NavLink to="/observability/events">Events</NavLink></div>
      </nav>
      <div className={`connection ${connected ? 'live' : ''}`}>{connected ? 'Live' : 'Reconnecting'}</div>
    </header>
    <main>
      <Routes>
        <Route path="/" element={<Navigate to="/cms" replace />} />
        <Route path="/cms" element={<CmsDashboardPage />} />
        <Route path="/cms/posts" element={<PostsPage />} />
        <Route path="/cms/posts/new" element={<PostEditorPage />} />
        <Route path="/cms/posts/:id/edit" element={<PostEditorPage />} />
        <Route path="/cms/updates" element={<UpdatesPage />} />
        <Route path="/cms/updates/new" element={<UpdateEditorPage />} />
        <Route path="/cms/updates/:id/edit" element={<UpdateEditorPage />} />
        <Route path="/cms/accounts" element={<AccountsPage />} />
        <Route path="/cms/community" element={<CommunityPage />} />
        <Route path="/cms/community/new" element={<CommunityEditorPage />} />
        <Route path="/cms/community/:id/edit" element={<CommunityEditorPage />} />
        <Route path="/observability" element={<HealthPage />} />
        <Route path="/observability/architecture" element={<ArchitecturePage />} />
        <Route path="/observability/routes" element={<RoutesPage />} />
        <Route path="/observability/logs" element={<LogsPage />} />
        <Route path="/observability/events" element={<EventsPage />} />
        <Route path="/architecture" element={<Navigate to="/observability/architecture" replace />} />
        <Route path="/routes" element={<Navigate to="/observability/routes" replace />} />
        <Route path="/logs" element={<Navigate to="/observability/logs" replace />} />
        <Route path="/events" element={<Navigate to="/observability/events" replace />} />
        <Route path="*" element={<Navigate to="/cms" replace />} />
      </Routes>
    </main>
  </StreamContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><Layout /></BrowserRouter>);
