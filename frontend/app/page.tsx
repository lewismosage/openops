"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, DashboardStats, Incident, Server } from "@/lib/api";

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

export default function HomePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [latestToken, setLatestToken] = useState<string | null>(null);

  const [serverForm, setServerForm] = useState({
    name: "",
    host: "",
    environment: "production",
    description: "",
  });

  const [notifyForm, setNotifyForm] = useState({
    name: "Discord Alerts",
    channel: "discord",
    webhook_url: "",
  });

  async function refresh() {
    try {
      const [dashboard, serverList, incidentList] = await Promise.all([
        api.dashboard(),
        api.servers(),
        api.incidents(),
      ]);
      setStats(dashboard);
      setServers(serverList);
      setIncidents(incidentList);
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

  async function handleAddServer(event: FormEvent) {
    event.preventDefault();
    const created = await api.createServer({
      name: serverForm.name,
      host: serverForm.host,
      environment: serverForm.environment,
      description: serverForm.description || undefined,
    });
    setLatestToken(created.agent_token);
    setServerForm({ name: "", host: "", environment: "production", description: "" });
    await refresh();
  }

  async function handleAddNotification(event: FormEvent) {
    event.preventDefault();
    await api.createNotification({
      name: notifyForm.name,
      channel: notifyForm.channel,
      config_json: JSON.stringify({ webhook_url: notifyForm.webhook_url }),
    });
    setNotifyForm({ ...notifyForm, webhook_url: "" });
    await refresh();
  }

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1 className="title">OpenOps</h1>
          <p className="subtitle">One dashboard for all your servers, with alerts when things break.</p>
        </div>
        <button className="primary-btn" onClick={refresh}>
          Refresh
        </button>
      </header>

      {error && <div className="panel" style={{ borderColor: "var(--down)", marginBottom: "1rem" }}>{error}</div>}

      <section className="grid stats-grid">
        <div className="panel">
          <div className="stat-label">Total servers</div>
          <div className="stat-value">{stats?.total_servers ?? "—"}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Healthy</div>
          <div className="stat-value" style={{ color: "var(--healthy)" }}>{stats?.healthy ?? "—"}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Degraded</div>
          <div className="stat-value" style={{ color: "var(--degraded)" }}>{stats?.degraded ?? "—"}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Down</div>
          <div className="stat-value" style={{ color: "var(--down)" }}>{stats?.down ?? "—"}</div>
        </div>
        <div className="panel">
          <div className="stat-label">Open incidents</div>
          <div className="stat-value">{stats?.open_incidents ?? "—"}</div>
        </div>
      </section>

      <section className="layout">
        <div className="panel">
          <h2>Servers</h2>
          <p className="muted">Add each server once, then attach health checks or run the agent.</p>
          <div className="server-list" style={{ marginTop: "1rem" }}>
            {servers.length === 0 && <p className="muted">No servers yet. Add your first server below.</p>}
            {servers.map((server) => (
              <div key={server.id} className="server-card">
                <div className="server-meta">
                  <div className="server-name">{server.name}</div>
                  <div className="server-host">
                    {server.host} · {server.environment}
                  </div>
                  {server.last_error && <div className="muted">{server.last_error}</div>}
                </div>
                <StatusBadge status={server.status} />
              </div>
            ))}
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
              <strong>Agent token (save this):</strong>
              <div>{latestToken}</div>
              <div className="muted" style={{ marginTop: "0.5rem" }}>
                Run: python agent/agent.py --hub http://localhost:8000 --token {latestToken}
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Recent incidents</h2>
          {incidents.length === 0 && <p className="muted">No incidents yet.</p>}
          {incidents.map((incident) => (
            <div key={incident.id} className="incident">
              <div className="incident-title">{incident.title}</div>
              <div className="incident-message">{incident.message}</div>
              <div className="muted" style={{ marginTop: "0.35rem" }}>
                {new Date(incident.started_at).toLocaleString()} · {incident.resolved ? "resolved" : "open"}
              </div>
            </div>
          ))}

          <form className="form" onSubmit={handleAddNotification}>
            <h3>Discord notifications</h3>
            <input
              placeholder="Notification name"
              value={notifyForm.name}
              onChange={(e) => setNotifyForm({ ...notifyForm, name: e.target.value })}
              required
            />
            <input
              placeholder="Discord webhook URL"
              value={notifyForm.webhook_url}
              onChange={(e) => setNotifyForm({ ...notifyForm, webhook_url: e.target.value })}
              required
            />
            <button className="primary-btn" type="submit">
              Save notification
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
