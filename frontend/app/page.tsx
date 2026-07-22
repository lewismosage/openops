"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  api,
  CheckType,
  DashboardStats,
  HealthCheck,
  Incident,
  Notification,
  NotificationChannel,
  Server,
} from "@/lib/api";

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
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

const emptyCheckForm = {
  name: "",
  check_type: "http" as CheckType,
  target: "",
  interval_seconds: 30,
  expected_status: 200,
};

export default function HomePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [latestToken, setLatestToken] = useState<string | null>(null);
  const [expandedServerId, setExpandedServerId] = useState<number | null>(null);
  const [expandedIncidentId, setExpandedIncidentId] = useState<number | null>(null);

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

  async function refresh() {
    try {
      const [dashboard, serverList, incidentList, notificationList] = await Promise.all([
        api.dashboard(),
        api.servers(),
        api.incidents(),
        api.notifications(),
      ]);
      setStats(dashboard);
      setServers(serverList);
      setIncidents(incidentList);
      setNotifications(notificationList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, []);

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
    setServerForm({ name: "", host: "", environment: "production", description: "" });
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

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1 className="title">OpenOps</h1>
          <p className="subtitle">Monitor your servers, catch failures, and see which host broke — with logs.</p>
        </div>
        <button className="primary-btn" onClick={refresh}>
          Refresh
        </button>
      </header>

      {error && (
        <div className="panel" style={{ borderColor: "var(--down)", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      <section className="grid stats-grid">
        <div className="panel">
          <div className="stat-label">Total servers</div>
          <div className="stat-value">{stats?.total_servers ?? "—"}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Healthy</div>
          <div className="stat-value" style={{ color: "var(--healthy)" }}>
            {stats?.healthy ?? "—"}
          </div>
        </div>
        <div className="panel">
          <div className="stat-label">Degraded</div>
          <div className="stat-value" style={{ color: "var(--degraded)" }}>
            {stats?.degraded ?? "—"}
          </div>
        </div>
        <div className="panel">
          <div className="stat-label">Down</div>
          <div className="stat-value" style={{ color: "var(--down)" }}>
            {stats?.down ?? "—"}
          </div>
        </div>
        <div className="panel">
          <div className="stat-label">Open incidents</div>
          <div className="stat-value">{stats?.open_incidents ?? "—"}</div>
        </div>
      </section>

      <section className="layout">
        <div className="panel">
          <h2>Servers</h2>
          <p className="muted">Add servers, attach health checks, and/or run the agent for CPU/RAM/disk + logs.</p>

          <div className="server-list" style={{ marginTop: "1rem" }}>
            {servers.length === 0 && <p className="muted">No servers yet. Add your first server below.</p>}
            {servers.map((server) => {
              const expanded = expandedServerId === server.id;
              const form = getCheckForm(server.id);
              const metric = server.latest_metric;
              return (
                <div key={server.id} className="server-card stacked">
                  <button
                    type="button"
                    className="server-card-button"
                    onClick={() => setExpandedServerId(expanded ? null : server.id)}
                  >
                    <div className="server-meta">
                      <div className="server-name">{server.name}</div>
                      <div className="server-host">
                        {server.host} · {server.environment}
                        {server.last_checked_at
                          ? ` · checked ${new Date(server.last_checked_at).toLocaleString()}`
                          : ""}
                      </div>
                      {server.last_error && <div className="error-line">{server.last_error}</div>}
                    </div>
                    <StatusBadge status={server.status} />
                  </button>

                  {expanded && (
                    <div className="server-details">
                      {(metric?.cpu_percent != null ||
                        metric?.memory_percent != null ||
                        metric?.disk_percent != null) && (
                        <div className="metrics-row">
                          <MetricBar label="CPU" value={metric?.cpu_percent} />
                          <MetricBar label="RAM" value={metric?.memory_percent} />
                          <MetricBar label="Disk" value={metric?.disk_percent} />
                        </div>
                      )}

                      <div className="detail-block">
                        <div className="detail-heading">Health checks</div>
                        {server.checks.length === 0 && (
                          <p className="muted">No checks yet. Add an HTTP/TCP/ping check below.</p>
                        )}
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
                                {check.last_checked_at
                                  ? ` · ${new Date(check.last_checked_at).toLocaleString()}`
                                  : ""}
                              </div>
                            </div>
                            <div className="row-actions">
                              <StatusBadge status={check.last_status} />
                              <button type="button" className="ghost-btn" onClick={() => toggleCheck(check)}>
                                {check.enabled ? "Disable" : "Enable"}
                              </button>
                              <button type="button" className="ghost-btn danger" onClick={() => handleDeleteCheck(check.id)}>
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}

                        <form className="form compact" onSubmit={(e) => handleAddCheck(e, server.id)}>
                          <h3>Add health check</h3>
                          <input
                            placeholder="Check name (e.g. API health)"
                            value={form.name}
                            onChange={(e) => updateCheckForm(server.id, { name: e.target.value })}
                            required
                          />
                          <div className="form-row">
                            <select
                              value={form.check_type}
                              onChange={(e) =>
                                updateCheckForm(server.id, { check_type: e.target.value as CheckType })
                              }
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
                              onChange={(e) =>
                                updateCheckForm(server.id, {
                                  interval_seconds: Number(e.target.value) || 30,
                                })
                              }
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
                            onChange={(e) => updateCheckForm(server.id, { target: e.target.value })}
                            required
                          />
                          {form.check_type === "http" && (
                            <input
                              type="number"
                              placeholder="Expected status"
                              value={form.expected_status}
                              onChange={(e) =>
                                updateCheckForm(server.id, {
                                  expected_status: Number(e.target.value) || 200,
                                })
                              }
                            />
                          )}
                          <button className="primary-btn" type="submit">
                            Add check
                          </button>
                        </form>
                      </div>

                      {server.last_log_excerpt && (
                        <div className="detail-block">
                          <div className="detail-heading">Recent logs from agent</div>
                          <pre className="log-box">{server.last_log_excerpt}</pre>
                        </div>
                      )}

                      {server.agent_token && (
                        <div className="token-box">
                          <strong>Agent token</strong>
                          <div>{server.agent_token}</div>
                          <div className="muted" style={{ marginTop: "0.5rem" }}>
                            python agent/agent.py --hub http://localhost:8000 --token {server.agent_token}
                            {" [--log-file /var/log/app.log]"}
                          </div>
                        </div>
                      )}

                      <button type="button" className="ghost-btn danger" onClick={() => handleDeleteServer(server.id)}>
                        Delete server
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <form className="form" onSubmit={handleAddServer}>
            <h3>Add server</h3>
            <input
              placeholder="Server name (e.g. Ubuntu-01)"
              value={serverForm.name}
              onChange={(e) => setServerForm({ ...serverForm, name: e.target.value })}
              required
            />
            <input
              placeholder="Host (IP or domain)"
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
            <button className="primary-btn" type="submit">
              Add server
            </button>
          </form>

          {latestToken && (
            <div className="token-box">
              <strong>New agent token (save this):</strong>
              <div>{latestToken}</div>
            </div>
          )}
        </div>

        <div className="side-column">
          <div className="panel">
            <h2>Incidents</h2>
            {incidents.length === 0 && <p className="muted">No incidents yet.</p>}
            {incidents.map((incident) => {
              const open = expandedIncidentId === incident.id;
              return (
                <div key={incident.id} className="incident">
                  <button
                    type="button"
                    className="incident-button"
                    onClick={() => setExpandedIncidentId(open ? null : incident.id)}
                  >
                    <div className="incident-title">{incident.title}</div>
                    <div className="muted">
                      {incident.server_name || `server #${incident.server_id}`} · {incident.severity} ·{" "}
                      {incident.resolved ? "resolved" : "open"} ·{" "}
                      {new Date(incident.started_at).toLocaleString()}
                    </div>
                  </button>
                  {open && (
                    <div className="incident-body">
                      <div className="incident-message">{incident.message}</div>
                      {incident.log_excerpt && (
                        <>
                          <div className="detail-heading" style={{ marginTop: "0.75rem" }}>
                            Log excerpt
                          </div>
                          <pre className="log-box">{incident.log_excerpt}</pre>
                        </>
                      )}
                      {!incident.resolved && (
                        <button
                          type="button"
                          className="ghost-btn"
                          style={{ marginTop: "0.75rem" }}
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

          <div className="panel">
            <h2>Notifications</h2>
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

            <form className="form" onSubmit={handleAddNotification}>
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
          </div>
        </div>
      </section>
    </main>
  );
}
