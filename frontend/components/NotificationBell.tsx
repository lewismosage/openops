"use client";

import { useEffect, useMemo, useState } from "react";
import type { Incident, Issue, Server } from "@/lib/api";

export type AlertKind = "issue" | "incident" | "status";

export type ServerAlert = {
  id: string;
  kind: AlertKind;
  severity: string;
  title: string;
  message: string;
  serverName: string | null;
  serverId: number | null;
  createdAt: string;
  open: boolean;
};

type Filter = "all" | "unread" | "critical" | "issues" | "incidents";

function parseUtcDate(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}

function relativeTime(value: string) {
  const diff = Date.now() - parseUtcDate(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(value: string) {
  return parseUtcDate(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function readKey(userId: number | null) {
  return `openops_alert_read_${userId ?? "anon"}`;
}

function dismissedKey(userId: number | null) {
  return `openops_alert_dismissed_${userId ?? "anon"}`;
}

function loadIdSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveIdSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

export function buildServerAlerts(
  issues: Issue[],
  incidents: Incident[],
  servers: Server[],
): ServerAlert[] {
  const items: ServerAlert[] = [];

  for (const issue of issues) {
    items.push({
      id: `issue-${issue.id}`,
      kind: "issue",
      severity: issue.severity,
      title: issue.title,
      message: issue.message,
      serverName: issue.server_name,
      serverId: issue.server_id,
      createdAt: issue.created_at,
      open: !issue.resolved,
    });
  }

  for (const incident of incidents) {
    items.push({
      id: `incident-${incident.id}`,
      kind: "incident",
      severity: incident.severity,
      title: incident.title,
      message: incident.message,
      serverName: incident.server_name,
      serverId: incident.server_id,
      createdAt: incident.started_at,
      open: !incident.resolved,
    });
  }

  for (const server of servers) {
    if (server.status !== "down" && server.status !== "degraded") continue;
    // Prefer issue/incident rows when present; still surface raw status when nothing else is open.
    const hasOpen = items.some((a) => a.serverId === server.id && a.open);
    if (hasOpen) continue;
    items.push({
      id: `status-${server.id}-${server.status}`,
      kind: "status",
      severity: server.status === "down" ? "critical" : "warning",
      title: `${server.name} is ${server.status}`,
      message: server.last_error || `Host ${server.host} reported status ${server.status}.`,
      serverName: server.name,
      serverId: server.id,
      createdAt: server.last_checked_at || server.created_at,
      open: true,
    });
  }

  return items.sort((a, b) => parseUtcDate(b.createdAt).getTime() - parseUtcDate(a.createdAt).getTime());
}

type Props = {
  userId: number | null;
  issues: Issue[];
  incidents: Incident[];
  servers: Server[];
  onRefresh: () => void | Promise<void>;
  onOpenIssue: (serverId: number | null) => void;
  onOpenIncident: (serverId: number | null) => void;
};

export function NotificationBell({
  userId,
  issues,
  incidents,
  servers,
  onRefresh,
  onOpenIssue,
  onOpenIncident,
}: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setReadIds(loadIdSet(readKey(userId)));
    setDismissedIds(loadIdSet(dismissedKey(userId)));
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const alerts = useMemo(
    () => buildServerAlerts(issues, incidents, servers).filter((a) => !dismissedIds.has(a.id)),
    [issues, incidents, servers, dismissedIds],
  );

  const unreadCount = useMemo(
    () => alerts.filter((a) => a.open && !readIds.has(a.id)).length,
    [alerts, readIds],
  );

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (filter === "unread") return a.open && !readIds.has(a.id);
      if (filter === "critical") return a.severity === "critical" || a.severity === "down";
      if (filter === "issues") return a.kind === "issue";
      if (filter === "incidents") return a.kind === "incident" || a.kind === "status";
      return true;
    });
  }, [alerts, filter, readIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [filter, open]);

  function persistRead(next: Set<string>) {
    setReadIds(next);
    saveIdSet(readKey(userId), next);
  }

  function persistDismissed(next: Set<string>) {
    setDismissedIds(next);
    saveIdSet(dismissedKey(userId), next);
  }

  function markRead(ids: string[]) {
    const next = new Set(readIds);
    ids.forEach((id) => next.add(id));
    persistRead(next);
  }

  function markAllRead() {
    const next = new Set(readIds);
    alerts.forEach((a) => next.add(a.id));
    persistRead(next);
  }

  function dismiss(ids: string[]) {
    const next = new Set(dismissedIds);
    ids.forEach((id) => next.add(id));
    persistDismissed(next);
    setSelected((prev) => {
      const copy = new Set(prev);
      ids.forEach((id) => copy.delete(id));
      return copy;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (pageItems.every((a) => selected.has(a.id))) {
      setSelected((prev) => {
        const next = new Set(prev);
        pageItems.forEach((a) => next.delete(a.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        pageItems.forEach((a) => next.add(a.id));
        return next;
      });
    }
  }

  function viewAlert(alert: ServerAlert) {
    markRead([alert.id]);
    setOpen(false);
    if (alert.kind === "issue") onOpenIssue(alert.serverId);
    else onOpenIncident(alert.serverId);
  }

  return (
    <>
      <button
        type="button"
        className="notif-bell"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path
            d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M9.5 17a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
        <span className={`notif-live-dot ${unreadCount > 0 ? "alert" : "ok"}`} />
      </button>

      {open && (
        <div className="notif-sheet-backdrop" onClick={() => setOpen(false)} role="presentation">
          <aside
            className="notif-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="notif-sheet-header">
              <div className="notif-sheet-title">
                <span className="notif-sheet-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path
                      d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M9.5 17a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <h2>Notifications</h2>
                  <p className="muted">Server alerts that need attention</p>
                </div>
              </div>
              <div className="notif-sheet-actions">
                <span className="notif-unread-pill">{unreadCount} Unread</span>
                <button type="button" className="ghost-btn" onClick={() => onRefresh()}>
                  Refresh
                </button>
                <button type="button" className="ghost-btn notif-close" onClick={() => setOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>
            </header>

            <div className="notif-tabs">
              {(
                [
                  ["all", "All"],
                  ["unread", "Unread"],
                  ["critical", "Critical"],
                  ["issues", "Issues"],
                  ["incidents", "Incidents"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`notif-tab ${filter === id ? "active" : ""}`}
                  onClick={() => setFilter(id)}
                >
                  {label}
                  {id === "unread" && unreadCount > 0 && <span className="nav-badge">{unreadCount}</span>}
                </button>
              ))}
            </div>

            <div className="notif-toolbar">
              <div>
                <h3>System Alerts</h3>
                <p className="muted">Important notifications about your monitored servers</p>
              </div>
              <div className="notif-toolbar-actions">
                <button type="button" className="ghost-btn" onClick={markAllRead} disabled={unreadCount === 0}>
                  Mark All as Read
                </button>
                {selected.size > 0 && (
                  <button
                    type="button"
                    className="ghost-btn danger-text"
                    onClick={() => dismiss([...selected])}
                  >
                    Delete selected
                  </button>
                )}
              </div>
            </div>

            <div className="notif-table-wrap">
              {pageItems.length === 0 ? (
                <div className="notif-empty">No notifications for this filter.</div>
              ) : (
                <table className="notif-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={pageItems.length > 0 && pageItems.every((a) => selected.has(a.id))}
                          onChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </th>
                      <th>Type</th>
                      <th>Message</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((alert) => {
                      const isUnread = alert.open && !readIds.has(alert.id);
                      return (
                        <tr key={alert.id} className={isUnread ? "unread" : ""}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(alert.id)}
                              onChange={() => toggleSelect(alert.id)}
                              aria-label={`Select ${alert.title}`}
                            />
                          </td>
                          <td>
                            <span className={`notif-type ${alert.kind}`}>
                              {alert.kind === "issue" ? "Issue" : alert.kind === "incident" ? "Incident" : "Status"}
                            </span>
                          </td>
                          <td>
                            <div className="notif-msg">
                              <strong>{alert.title}</strong>
                              <span className="muted">
                                {alert.serverName ? `${alert.serverName} · ` : ""}
                                {alert.message}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="notif-date">
                              <strong>{relativeTime(alert.createdAt)}</strong>
                              <span className="muted">{formatDate(alert.createdAt)}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`notif-status ${isUnread ? "unread" : "read"}`}>
                              {isUnread ? "Unread" : "Read"}
                            </span>
                          </td>
                          <td>
                            <div className="notif-row-actions">
                              <button type="button" className="ghost-btn icon-btn" onClick={() => viewAlert(alert)}>
                                View
                              </button>
                              <button
                                type="button"
                                className="ghost-btn icon-btn danger-text"
                                onClick={() => dismiss([alert.id])}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <footer className="notif-footer">
              <span className="muted">
                Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
                {Math.min(page * pageSize, filtered.length)} of {filtered.length} entries
              </span>
              <div className="notif-pagination">
                <button type="button" className="ghost-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
