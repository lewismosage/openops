"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  CheckType,
  DashboardStats,
  HealthCheck,
  Incident,
  Issue,
  Notification,
  NotificationChannel,
  Server,
  ServerInsights,
  SparklinePoint,
} from "@/lib/api";
import {
  clearSession,
  getSessionExpiryReason,
  getStoredUser,
  isAuthenticated,
  touchActivity,
  type AuthUser,
} from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";

type NavSection = "servers" | "issues" | "incidents" | "notifications";

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

function StatusWave({ status }: { status: string }) {
  const color =
    status === "healthy"
      ? "var(--healthy)"
      : status === "degraded"
        ? "var(--degraded)"
        : status === "down"
          ? "var(--down)"
          : "var(--unknown)";
  return (
    <div className="status-ring" title={status} aria-label={status}>
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        <path d="M2 12h3l2-5 3 10 3-7 2 2h5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function MetricBar({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null;
  const color = value >= 90 ? "var(--down)" : value >= 75 ? "var(--degraded)" : "var(--healthy)";
  return (
    <div className="metric">
      <div className="metric-label">
        <span>{label}</span>
        <span>{value.toFixed(0)}%</span>
      </div>
      <div className="metric-track">
        <div className="metric-fill" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function LatencySparkline({ points }: { points: SparklinePoint[] }) {
  const values = points.map((p) => p.response_ms).filter((v): v is number => v != null);
  if (values.length < 2) {
    return <p className="muted">Not enough latency samples yet — checks will fill this in.</p>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const w = 320;
  const h = 56;
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * (h - 8) - 4;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="sparkline" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="var(--focus)" strokeWidth="2" />
      </svg>
      <div className="sparkline-legend">
        <span>{min.toFixed(0)}ms</span>
        <span>{max.toFixed(0)}ms</span>
      </div>
    </div>
  );
}

function parseUtcDate(value: string): Date {
  // Backend stores naive UTC; browsers treat "YYYY-MM-DDTHH:mm:ss" as local unless Z/offset is present.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "Never checked";
  const diff = Date.now() - parseUtcDate(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function initialFor(name: string) {
  return (name.trim()[0] || "?").toUpperCase();
}

function formatPct(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function formatMs(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(0)}ms`;
}

const emptyCheckForm = {
  name: "",
  check_type: "http" as CheckType,
  target: "",
  interval_seconds: 30,
  expected_status: 200,
};

export default function HomePage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [latestToken, setLatestToken] = useState<string | null>(null);
  const [expandedServerId, setExpandedServerId] = useState<number | null>(null);
  const [expandedIncidentId, setExpandedIncidentId] = useState<number | null>(null);
  const [insights, setInsights] = useState<ServerInsights | null>(null);
  const [section, setSection] = useState<NavSection>("servers");
  const [query, setQuery] = useState("");
  const [showAddServer, setShowAddServer] = useState(false);

  const [serverForm, setServerForm] = useState({
    name: "",
    host: "",
    environment: "production",
    description: "",
  });

  const [checkForms, setCheckForms] = useState<Record<number, typeof emptyCheckForm>>({});

  const [notifyForm, setNotifyForm] = useState({
    name: "Discord Alerts",
    channel: "discord" as NotificationChannel,
    webhook_url: "",
    bot_token: "",
    chat_id: "",
    url: "",
    smtp_host: "",
    smtp_port: "587",
    username: "",
    password: "",
    from_email: "",
    to_email: "",
  });

  async function handleLogout(reason?: string) {
    try {
      await api.logout();
    } catch {
      // ignore network errors on logout
    }
    clearSession();
    router.replace(reason ? `/login?expired=1` : "/login");
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setUser(getStoredUser());
    setAuthReady(true);
  }, [router]);

  useEffect(() => {
    if (!authReady) return;
    const onActivity = () => touchActivity();
    const events = ["mousemove", "keydown", "click", "scroll"] as const;
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
    const timer = window.setInterval(() => {
      const reason = getSessionExpiryReason();
      if (reason === "absolute") {
        handleLogout("expired");
      } else if (reason === "inactivity") {
        setSessionNotice("Your session expired due to inactivity.");
      }
    }, 30_000);
    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity));
      window.clearInterval(timer);
    };
  }, [authReady]);

  async function refresh() {
    try {
      const [dashboard, serverList, incidentList, issueList, notificationList] = await Promise.all([
        api.dashboard(),
        api.servers(),
        api.incidents(),
        api.issues(false),
        api.notifications(),
      ]);
      setStats(dashboard);
      setServers(serverList);
      setIncidents(incidentList);
      setIssues(issueList);
      setNotifications(notificationList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    }
  }

  useEffect(() => {
    if (!authReady) return;
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [authReady]);

  useEffect(() => {
    if (!expandedServerId) {
      setInsights(null);
      return;
    }
    let cancelled = false;
    api.serverInsights(expandedServerId).then((data) => {
      if (!cancelled) setInsights(data);
    });
    return () => {
      cancelled = true;
    };
  }, [expandedServerId, servers]);

  const filteredServers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.host.toLowerCase().includes(q) ||
        s.environment.toLowerCase().includes(q),
    );
  }, [servers, query]);

  const openIncidents = useMemo(() => incidents.filter((i) => !i.resolved), [incidents]);
  const recentIncidents = useMemo(() => incidents.slice(0, 8), [incidents]);
  const criticalIssues = useMemo(
    () => issues.filter((i) => !i.resolved && i.severity === "critical"),
    [issues],
  );
  const selectedServer = servers.find((s) => s.id === expandedServerId) || null;

  const total = Math.max(stats?.total_servers || 0, 1);
  const usageRows = [
    { label: "Healthy", value: stats?.healthy ?? 0, tone: "healthy" as const },
    { label: "Degraded", value: stats?.degraded ?? 0, tone: "degraded" as const },
    { label: "Down", value: stats?.down ?? 0, tone: "down" as const },
    { label: "Unknown", value: stats?.unknown ?? 0, tone: "unknown" as const },
  ];

  function getCheckForm(serverId: number) {
    return checkForms[serverId] || emptyCheckForm;
  }

  function updateCheckForm(serverId: number, patch: Partial<typeof emptyCheckForm>) {
    setCheckForms((prev) => ({
      ...prev,
      [serverId]: { ...(prev[serverId] || emptyCheckForm), ...patch },
    }));
  }

  async function handleAddServer(event: FormEvent) {
    event.preventDefault();
    const created = await api.createServer({
      name: serverForm.name,
      host: serverForm.host,
      environment: serverForm.environment,
      description: serverForm.description || undefined,
    });
    setLatestToken(created.agent_token);
    setExpandedServerId(created.id);
    setShowAddServer(false);
    setServerForm({ name: "", host: "", environment: "production", description: "" });
    setSection("servers");
    await refresh();
  }

  async function handleDeleteServer(serverId: number) {
    if (!confirm("Delete this server and all its checks/incidents?")) return;
    await api.deleteServer(serverId);
    if (expandedServerId === serverId) setExpandedServerId(null);
    await refresh();
  }

  async function handleAddCheck(event: FormEvent, serverId: number) {
    event.preventDefault();
    const form = getCheckForm(serverId);
    await api.createCheck(serverId, {
      name: form.name,
      check_type: form.check_type,
      target: form.target,
      interval_seconds: Number(form.interval_seconds) || 30,
      expected_status: form.check_type === "http" ? Number(form.expected_status) || 200 : null,
    });
    setCheckForms((prev) => ({ ...prev, [serverId]: emptyCheckForm }));
    await refresh();
  }

  async function toggleCheck(check: HealthCheck) {
    await api.updateCheck(check.id, { enabled: !check.enabled });
    await refresh();
  }

  async function handleDeleteCheck(checkId: number) {
    await api.deleteCheck(checkId);
    await refresh();
  }

  async function handleAddNotification(event: FormEvent) {
    event.preventDefault();
    let config: Record<string, string> = {};
    if (notifyForm.channel === "discord") {
      config = { webhook_url: notifyForm.webhook_url };
    } else if (notifyForm.channel === "telegram") {
      config = { bot_token: notifyForm.bot_token, chat_id: notifyForm.chat_id };
    } else if (notifyForm.channel === "webhook") {
      config = { url: notifyForm.url };
    } else {
      config = {
        smtp_host: notifyForm.smtp_host,
        smtp_port: notifyForm.smtp_port,
        username: notifyForm.username,
        password: notifyForm.password,
        from_email: notifyForm.from_email,
        to_email: notifyForm.to_email,
      };
    }

    await api.createNotification({
      name: notifyForm.name,
      channel: notifyForm.channel,
      config_json: JSON.stringify(config),
    });
    setNotifyForm({
      ...notifyForm,
      webhook_url: "",
      bot_token: "",
      chat_id: "",
      url: "",
      password: "",
    });
    await refresh();
  }

  async function handleResolveIncident(id: number) {
    await api.resolveIncident(id);
    await refresh();
  }

  async function handleResolveIssue(id: number) {
    await api.resolveIssue(id);
    await refresh();
  }

  function sectionTitle() {
    if (section === "servers") return "Servers";
    if (section === "issues") return "Issues";
    if (section === "incidents") return "Incidents";
    return "Notifications";
  }

  if (!authReady) {
    return (
      <div className="login-page">
        <div className="login-card muted">Checking session…</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">O</div>
          <div className="brand-text">OpenOps</div>
        </div>

        <nav className="sidebar-nav">
          {(
            [
              ["servers", "Servers"],
              ["issues", "Issues"],
              ["incidents", "Incidents"],
              ["notifications", "Notifications"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${section === id ? "active" : ""}`}
              onClick={() => setSection(id)}
            >
              <span className="nav-icon" aria-hidden>
                {id === "servers" && "▦"}
                {id === "issues" && "!"}
                {id === "incidents" && "⚠"}
                {id === "notifications" && "⚑"}
              </span>
              <span style={{ flex: 1 }}>{label}</span>
              {id === "issues" && issues.length > 0 && <span className="nav-badge">{issues.length}</span>}
              {id === "incidents" && openIncidents.length > 0 && (
                <span className="nav-badge">{openIncidents.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user" title={user?.email || ""}>
            {user?.name || user?.email || "Signed in"}
          </div>
          <button type="button" className="ghost-btn sidebar-logout" onClick={() => handleLogout()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <span className="crumb">
              All Servers <span className="crumb-sep">/</span> <strong>{sectionTitle()}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <NotificationBell
              userId={user?.id ?? null}
              issues={issues}
              incidents={incidents}
              servers={servers}
              onRefresh={refresh}
              onOpenIssue={(serverId) => {
                setSection("issues");
                if (serverId) setExpandedServerId(serverId);
              }}
              onOpenIncident={(serverId) => {
                setSection("incidents");
                if (serverId) setExpandedServerId(serverId);
              }}
            />
            {section === "servers" && (
              <input
                className="search-box"
                placeholder="Search servers"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            {section === "servers" && (
              <>
                <button type="button" className="ghost-btn" onClick={refresh}>
                  Refresh
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    setSection("servers");
                    setShowAddServer(true);
                  }}
                >
                  Add New
                </button>
              </>
            )}
          </div>
        </header>

        <div className="content">
          {sessionNotice && (
            <div className="session-modal-backdrop" role="dialog" aria-modal="true">
              <div className="session-modal">
                <h2>Session expired</h2>
                <p className="muted">{sessionNotice}</p>
                <button type="button" className="primary-btn" onClick={() => handleLogout("expired")}>
                  Sign in again
                </button>
              </div>
            </div>
          )}
          {error && <div className="error-banner">{error}</div>}

          {section === "servers" && (
            <div className="overview-grid">
              <aside className="overview-rail">
                <section className="card">
                  <div className="card-header">
                    <h2 className="card-title">Usage</h2>
                    <span className="card-meta">Live fleet</span>
                  </div>
                  <div className="usage-row">
                    <div className="usage-item">
                      <div className="usage-label">
                        <span>Total servers</span>
                        <strong>{stats?.total_servers ?? 0}</strong>
                      </div>
                      <div className="usage-track">
                        <div className="usage-fill" style={{ width: "100%" }} />
                      </div>
                    </div>
                    {usageRows.map((row) => (
                      <div key={row.label} className="usage-item">
                        <div className="usage-label">
                          <span>{row.label}</span>
                          <strong>
                            {row.value} / {stats?.total_servers ?? 0}
                          </strong>
                        </div>
                        <div className="usage-track">
                          <div
                            className={`usage-fill ${row.tone}`}
                            style={{ width: `${Math.min(100, (row.value / total) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="card">
                  <div className="card-header">
                    <h2 className="card-title">Alerts</h2>
                    <span className="card-meta">{issues.length} open</span>
                  </div>
                  {issues.length === 0 ? (
                    <div className="alert-empty">No open alerts</div>
                  ) : (
                    <div className="activity-list">
                      {issues.slice(0, 5).map((issue) => (
                        <button
                          key={issue.id}
                          type="button"
                          className="activity-item"
                          onClick={() => setSection("issues")}
                        >
                          <div className="activity-top">
                            <span className={`status-dot ${issue.severity === "critical" ? "open" : "degraded"}`} />
                            <span className="activity-title">{issue.title}</span>
                          </div>
                          <div className="activity-meta">
                            {issue.server_name || `server #${issue.server_id}`} · {issue.severity} ·{" "}
                            {relativeTime(issue.created_at)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="card">
                  <div className="card-header">
                    <h2 className="card-title">Recent activity</h2>
                  </div>
                  {recentIncidents.length === 0 ? (
                    <div className="alert-empty">No incidents yet</div>
                  ) : (
                    <div className="activity-list">
                      {recentIncidents.map((incident) => (
                        <div key={incident.id} className="activity-item">
                          <div className="activity-top">
                            <span className={`status-dot ${incident.resolved ? "resolved" : "open"}`} />
                            <span className="activity-title">{incident.title}</span>
                          </div>
                          <div className="activity-meta">
                            {incident.resolved ? "resolved" : "open"} · {relativeTime(incident.started_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </aside>

              <section className="projects-pane">
                <div className="pane-header">
                  <h2 className="pane-title">Servers</h2>
                  <span className="muted">{filteredServers.length} shown</span>
                </div>

                {filteredServers.length === 0 ? (
                  <div className="card empty-state">
                    No servers yet. Click <strong>Add New</strong> to register your first host.
                  </div>
                ) : (
                  <div className="project-grid">
                    {filteredServers.map((server) => (
                      <button
                        key={server.id}
                        type="button"
                        className={`project-card ${expandedServerId === server.id ? "selected" : ""}`}
                        onClick={() => {
                          setExpandedServerId(expandedServerId === server.id ? null : server.id);
                        }}
                      >
                        <div className="project-card-top">
                          <div className="project-identity">
                            <div className="project-avatar">{initialFor(server.name)}</div>
                            <div style={{ minWidth: 0 }}>
                              <h3 className="project-name">{server.name}</h3>
                              <p className="project-host">{server.host}</p>
                            </div>
                          </div>
                          <StatusWave status={server.status} />
                        </div>
                        <div className="project-stats">
                          <span>Uptime {formatPct(server.uptime_24h)}</span>
                          <span>Avg {formatMs(server.avg_latency_ms)}</span>
                          <span>
                            {server.open_issues} issue{server.open_issues === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="project-footer">
                          <span className="project-footer-meta">
                            {server.environment} · {server.checks.length} checks ·{" "}
                            {relativeTime(server.last_checked_at)}
                          </span>
                          <StatusBadge status={server.status} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {(showAddServer || servers.length === 0) && (
                  <div className="detail-panel">
                    <form className="form" onSubmit={handleAddServer}>
                      <h3>Add server</h3>
                      <input
                        placeholder="Server name (e.g. ACNA-SERVER)"
                        value={serverForm.name}
                        onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })}
                        required
                      />
                      <input
                        placeholder="Host (IP, domain, or URL)"
                        value={serverForm.host}
                        onChange={(e) => setServerForm({ ...serverForm, host: e.target.value })}
                        required
                      />
                      <select
                        value={serverForm.environment}
                        onChange={(e) => setServerForm({ ...serverForm, environment: e.target.value })}
                      >
                        <option value="production">Production</option>
                        <option value="staging">Staging</option>
                        <option value="development">Development</option>
                      </select>
                      <textarea
                        placeholder="Optional description"
                        value={serverForm.description}
                        onChange={(e) => setServerForm({ ...serverForm, description: e.target.value })}
                        rows={2}
                      />
                      <div className="row-actions">
                        {servers.length > 0 && (
                          <button type="button" className="ghost-btn" onClick={() => setShowAddServer(false)}>
                            Cancel
                          </button>
                        )}
                        <button className="primary-btn" type="submit">
                          Add server
                        </button>
                      </div>
                    </form>
                    {latestToken && (
                      <div className="token-box">
                        <strong>New agent token (save this):</strong>
                        <div>{latestToken}</div>
                      </div>
                    )}
                  </div>
                )}

                {selectedServer && (
                  <ServerDetail
                    server={selectedServer}
                    insights={insights}
                    form={getCheckForm(selectedServer.id)}
                    serverIssues={issues.filter((i) => i.server_id === selectedServer.id)}
                    onUpdateForm={(patch) => updateCheckForm(selectedServer.id, patch)}
                    onAddCheck={(e) => handleAddCheck(e, selectedServer.id)}
                    onToggleCheck={toggleCheck}
                    onDeleteCheck={handleDeleteCheck}
                    onDeleteServer={() => handleDeleteServer(selectedServer.id)}
                    onResolveIssue={handleResolveIssue}
                  />
                )}
              </section>
            </div>
          )}

          {section === "issues" && (
            <section className="card issues-panel">
              <div className="issues-hero">
                <h2 className="issues-hero-title">
                  {issues.length === 0
                    ? "No open issues"
                    : "These issues need your attention"}
                </h2>
                <p className="muted">
                  {criticalIssues.length} critical · {issues.length} open total · detected from checks,
                  heartbeats, and metrics
                </p>
              </div>

              {issues.length === 0 ? (
                <div className="alert-empty">All clear. OpenOps will surface problems here as they appear.</div>
              ) : (
                <div className="issue-list">
                  {issues.map((issue) => (
                    <div key={issue.id} className={`issue-card ${issue.severity}`}>
                      <div className="issue-card-top">
                        <span className="issue-severity">{issue.severity} issue</span>
                        <code className="issue-code">{issue.code}</code>
                      </div>
                      <h3 className="issue-title">{issue.title}</h3>
                      <p className="issue-message">{issue.message}</p>
                      <div className="issue-footer">
                        <span className="muted">
                          {issue.server_name || `server #${issue.server_id}`} · {relativeTime(issue.created_at)}
                        </span>
                        <button type="button" className="ghost-btn" onClick={() => handleResolveIssue(issue.id)}>
                          Resolve issue
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {section === "incidents" && (
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Incidents</h2>
                <span className="card-meta">{openIncidents.length} open</span>
              </div>
              {incidents.length === 0 && <div className="alert-empty">No incidents yet.</div>}
              <div className="activity-list">
                {incidents.map((incident) => {
                  const open = expandedIncidentId === incident.id;
                  return (
                    <div key={incident.id}>
                      <button
                        type="button"
                        className="activity-item"
                        onClick={() => setExpandedIncidentId(open ? null : incident.id)}
                      >
                        <div className="activity-top">
                          <span className={`status-dot ${incident.resolved ? "resolved" : "open"}`} />
                          <span className="activity-title">{incident.title}</span>
                        </div>
                        <div className="activity-meta">
                          {incident.server_name || `server #${incident.server_id}`} · {incident.severity} ·{" "}
                          {incident.resolved ? "resolved" : "open"} · {relativeTime(incident.started_at)}
                        </div>
                      </button>
                      {open && (
                        <div className="incident-body">
                          <div className="incident-message">{incident.message}</div>
                          {incident.log_excerpt && <pre className="log-box">{incident.log_excerpt}</pre>}
                          {!incident.resolved && (
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => handleResolveIncident(incident.id)}
                            >
                              Mark resolved
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {section === "notifications" && (
            <section className="card" style={{ maxWidth: 640 }}>
              <div className="card-header">
                <h2 className="card-title">Notifications</h2>
              </div>
              {notifications.length === 0 && <p className="muted">No notification channels yet.</p>}
              {notifications.map((notification) => (
                <div key={notification.id} className="notification-row">
                  <div>
                    <div className="check-name">{notification.name}</div>
                    <div className="muted">
                      {notification.channel} · {notification.enabled ? "enabled" : "disabled"}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() =>
                        api.updateNotification(notification.id, { enabled: !notification.enabled }).then(refresh)
                      }
                    >
                      {notification.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn danger"
                      onClick={() => api.deleteNotification(notification.id).then(refresh)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              <form className="form" onSubmit={handleAddNotification} style={{ marginTop: "1rem" }}>
                <h3>Add notification channel</h3>
                <input
                  placeholder="Name"
                  value={notifyForm.name}
                  onChange={(e) => setNotifyForm({ ...notifyForm, name: e.target.value })}
                  required
                />
                <select
                  value={notifyForm.channel}
                  onChange={(e) =>
                    setNotifyForm({ ...notifyForm, channel: e.target.value as NotificationChannel })
                  }
                >
                  <option value="discord">Discord</option>
                  <option value="telegram">Telegram</option>
                  <option value="webhook">Webhook</option>
                  <option value="email">Email</option>
                </select>

                {notifyForm.channel === "discord" && (
                  <input
                    placeholder="Discord webhook URL"
                    value={notifyForm.webhook_url}
                    onChange={(e) => setNotifyForm({ ...notifyForm, webhook_url: e.target.value })}
                    required
                  />
                )}
                {notifyForm.channel === "telegram" && (
                  <>
                    <input
                      placeholder="Bot token"
                      value={notifyForm.bot_token}
                      onChange={(e) => setNotifyForm({ ...notifyForm, bot_token: e.target.value })}
                      required
                    />
                    <input
                      placeholder="Chat ID"
                      value={notifyForm.chat_id}
                      onChange={(e) => setNotifyForm({ ...notifyForm, chat_id: e.target.value })}
                      required
                    />
                  </>
                )}
                {notifyForm.channel === "webhook" && (
                  <input
                    placeholder="Webhook URL"
                    value={notifyForm.url}
                    onChange={(e) => setNotifyForm({ ...notifyForm, url: e.target.value })}
                    required
                  />
                )}
                {notifyForm.channel === "email" && (
                  <>
                    <input
                      placeholder="SMTP host"
                      value={notifyForm.smtp_host}
                      onChange={(e) => setNotifyForm({ ...notifyForm, smtp_host: e.target.value })}
                      required
                    />
                    <input
                      placeholder="SMTP port"
                      value={notifyForm.smtp_port}
                      onChange={(e) => setNotifyForm({ ...notifyForm, smtp_port: e.target.value })}
                      required
                    />
                    <input
                      placeholder="Username"
                      value={notifyForm.username}
                      onChange={(e) => setNotifyForm({ ...notifyForm, username: e.target.value })}
                      required
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={notifyForm.password}
                      onChange={(e) => setNotifyForm({ ...notifyForm, password: e.target.value })}
                      required
                    />
                    <input
                      placeholder="From email"
                      value={notifyForm.from_email}
                      onChange={(e) => setNotifyForm({ ...notifyForm, from_email: e.target.value })}
                      required
                    />
                    <input
                      placeholder="To email"
                      value={notifyForm.to_email}
                      onChange={(e) => setNotifyForm({ ...notifyForm, to_email: e.target.value })}
                      required
                    />
                  </>
                )}
                <button className="primary-btn" type="submit">
                  Save notification
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ServerDetail({
  server,
  insights,
  form,
  serverIssues,
  onUpdateForm,
  onAddCheck,
  onToggleCheck,
  onDeleteCheck,
  onDeleteServer,
  onResolveIssue,
}: {
  server: Server;
  insights: ServerInsights | null;
  form: typeof emptyCheckForm;
  serverIssues: Issue[];
  onUpdateForm: (patch: Partial<typeof emptyCheckForm>) => void;
  onAddCheck: (event: FormEvent) => void;
  onToggleCheck: (check: HealthCheck) => void;
  onDeleteCheck: (checkId: number) => void;
  onDeleteServer: () => void;
  onResolveIssue: (id: number) => void;
}) {
  const metric = server.latest_metric;
  return (
    <div className="detail-panel">
      <div className="pane-header">
        <h3 className="detail-heading">{server.name}</h3>
        <StatusBadge status={server.status} />
      </div>

      <div className="insight-grid">
        <div className="insight-stat">
          <span className="muted">Uptime 24h</span>
          <strong>{formatPct(insights?.uptime_24h ?? server.uptime_24h)}</strong>
        </div>
        <div className="insight-stat">
          <span className="muted">Uptime 7d</span>
          <strong>{formatPct(insights?.uptime_7d)}</strong>
        </div>
        <div className="insight-stat">
          <span className="muted">Avg latency</span>
          <strong>{formatMs(insights?.avg_latency_ms ?? server.avg_latency_ms)}</strong>
        </div>
        <div className="insight-stat">
          <span className="muted">p95 latency</span>
          <strong>{formatMs(insights?.p95_latency_ms)}</strong>
        </div>
      </div>

      <div>
        <h3 className="detail-heading">Latency</h3>
        <LatencySparkline points={insights?.sparkline || []} />
      </div>

      {(metric?.cpu_percent != null || metric?.memory_percent != null || metric?.disk_percent != null) && (
        <div className="metrics-row">
          <MetricBar label="CPU" value={metric?.cpu_percent} />
          <MetricBar label="RAM" value={metric?.memory_percent} />
          <MetricBar label="Disk" value={metric?.disk_percent} />
        </div>
      )}

      {serverIssues.length > 0 && (
        <div>
          <h3 className="detail-heading">Open issues</h3>
          {serverIssues.map((issue) => (
            <div key={issue.id} className={`issue-card compact ${issue.severity}`}>
              <div className="issue-card-top">
                <span className="issue-severity">{issue.severity}</span>
                <code className="issue-code">{issue.code}</code>
              </div>
              <div className="issue-title">{issue.title}</div>
              <div className="issue-footer">
                <span className="muted">{relativeTime(issue.created_at)}</span>
                <button type="button" className="ghost-btn" onClick={() => onResolveIssue(issue.id)}>
                  Resolve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <h3 className="detail-heading">Health checks</h3>
        {server.checks.length === 0 && <p className="muted">No checks yet. Add an HTTP/TCP/ping check below.</p>}
        {server.checks.map((check) => (
          <div key={check.id} className="check-row">
            <div>
              <div className="check-name">
                {check.name}{" "}
                <span className="muted">
                  ({check.check_type} → {check.target})
                </span>
              </div>
              {check.last_error && <div className="error-line">{check.last_error}</div>}
              <div className="muted">
                {check.enabled ? "enabled" : "disabled"}
                {check.last_response_ms != null ? ` · ${check.last_response_ms.toFixed(0)}ms` : ""}
                {check.last_checked_at ? ` · ${relativeTime(check.last_checked_at)}` : ""}
              </div>
            </div>
            <div className="row-actions">
              <StatusBadge status={check.last_status} />
              <button type="button" className="ghost-btn" onClick={() => onToggleCheck(check)}>
                {check.enabled ? "Disable" : "Enable"}
              </button>
              <button type="button" className="ghost-btn danger" onClick={() => onDeleteCheck(check.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}

        <form className="form" onSubmit={onAddCheck} style={{ marginTop: "0.75rem" }}>
          <h3>Add health check</h3>
          <input
            placeholder="Check name (e.g. API health)"
            value={form.name}
            onChange={(e) => onUpdateForm({ name: e.target.value })}
            required
          />
          <div className="form-row">
            <select
              value={form.check_type}
              onChange={(e) => onUpdateForm({ check_type: e.target.value as CheckType })}
            >
              <option value="http">HTTP</option>
              <option value="tcp">TCP</option>
              <option value="ping">Ping</option>
            </select>
            <input
              type="number"
              min={15}
              placeholder="Interval (sec)"
              value={form.interval_seconds}
              onChange={(e) => onUpdateForm({ interval_seconds: Number(e.target.value) || 30 })}
            />
          </div>
          <input
            placeholder={
              form.check_type === "http"
                ? "https://example.com/health"
                : form.check_type === "tcp"
                  ? "host:5432"
                  : "8.8.8.8"
            }
            value={form.target}
            onChange={(e) => onUpdateForm({ target: e.target.value })}
            required
          />
          {form.check_type === "http" && (
            <input
              type="number"
              placeholder="Expected status"
              value={form.expected_status}
              onChange={(e) => onUpdateForm({ expected_status: Number(e.target.value) || 200 })}
            />
          )}
          <button className="primary-btn" type="submit">
            Add check
          </button>
        </form>
      </div>

      {server.last_log_excerpt && (
        <div>
          <h3 className="detail-heading">Recent logs from agent</h3>
          <pre className="log-box">{server.last_log_excerpt}</pre>
        </div>
      )}

      {server.agent_token && (
        <div className="token-box">
          <strong>Agent token</strong>
          <div>{server.agent_token}</div>
          <div className="muted" style={{ marginTop: "0.5rem" }}>
            python agent/agent.py --hub http://localhost:8000 --token {server.agent_token}
          </div>
        </div>
      )}

      <button type="button" className="ghost-btn danger" onClick={onDeleteServer}>
        Delete server
      </button>
    </div>
  );
}
