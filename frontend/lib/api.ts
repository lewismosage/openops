export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type ServerStatus = "healthy" | "degraded" | "down" | "unknown";
export type CheckType = "http" | "tcp" | "ping" | "agent";
export type NotificationChannel = "discord" | "telegram" | "webhook" | "email";

export interface DashboardStats {
  total_servers: number;
  healthy: number;
  degraded: number;
  down: number;
  unknown: number;
  open_incidents: number;
}

export interface Metric {
  id: number;
  server_id: number;
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  load_avg: number | null;
  recorded_at: string;
}

export interface HealthCheck {
  id: number;
  server_id: number;
  name: string;
  check_type: CheckType;
  target: string;
  interval_seconds: number;
  timeout_seconds: number;
  expected_status: number | null;
  enabled: boolean;
  last_status: ServerStatus;
  last_response_ms: number | null;
  last_error: string | null;
  last_checked_at: string | null;
}

export interface Server {
  id: number;
  name: string;
  host: string;
  environment: string;
  description: string | null;
  status: ServerStatus;
  last_checked_at: string | null;
  last_error: string | null;
  last_log_excerpt: string | null;
  agent_token: string | null;
  created_at: string;
  latest_metric: Metric | null;
  checks: HealthCheck[];
}

export interface Incident {
  id: number;
  server_id: number;
  server_name: string | null;
  title: string;
  message: string;
  log_excerpt: string | null;
  severity: string;
  resolved: boolean;
  started_at: string;
  resolved_at: string | null;
}

export interface Notification {
  id: number;
  name: string;
  channel: NotificationChannel;
  config_json: string;
  enabled: boolean;
  created_at: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export const api = {
  dashboard: () => request<DashboardStats>("/api/dashboard"),
  servers: () => request<Server[]>("/api/servers"),
  incidents: () => request<Incident[]>("/api/incidents"),
  notifications: () => request<Notification[]>("/api/notifications"),
  createServer: (data: { name: string; host: string; environment: string; description?: string }) =>
    request<Server>("/api/servers", { method: "POST", body: JSON.stringify(data) }),
  deleteServer: (id: number) => request<{ ok: boolean }>(`/api/servers/${id}`, { method: "DELETE" }),
  createCheck: (
    serverId: number,
    data: {
      name: string;
      check_type: CheckType;
      target: string;
      interval_seconds?: number;
      expected_status?: number | null;
      enabled?: boolean;
    },
  ) => request<HealthCheck>(`/api/servers/${serverId}/checks`, { method: "POST", body: JSON.stringify(data) }),
  updateCheck: (checkId: number, data: Partial<HealthCheck>) =>
    request<HealthCheck>(`/api/checks/${checkId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCheck: (checkId: number) => request<{ ok: boolean }>(`/api/checks/${checkId}`, { method: "DELETE" }),
  createNotification: (data: { name: string; channel: string; config_json: string }) =>
    request<Notification>("/api/notifications", {
      method: "POST",
      body: JSON.stringify({ ...data, enabled: true }),
    }),
  updateNotification: (id: number, data: { enabled?: boolean; name?: string }) =>
    request<Notification>(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteNotification: (id: number) =>
    request<{ ok: boolean }>(`/api/notifications/${id}`, { method: "DELETE" }),
  resolveIncident: (id: number) =>
    request<Incident>(`/api/incidents/${id}/resolve`, { method: "POST" }),
};
