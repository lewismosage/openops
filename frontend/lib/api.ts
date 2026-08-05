import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  persistSession,
  touchActivity,
  type AuthUser,
  type SessionPolicy,
} from "@/lib/auth";

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
  open_issues: number;
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
  uptime_24h: number | null;
  avg_latency_ms: number | null;
  open_issues: number;
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

export interface Issue {
  id: number;
  server_id: number;
  server_name: string | null;
  code: string;
  severity: string;
  title: string;
  message: string;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface SparklinePoint {
  checked_at: string;
  response_ms: number | null;
  status: string;
}

export interface ServerInsights {
  server_id: number;
  uptime_24h: number | null;
  uptime_7d: number | null;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  open_issues: number;
  sparkline: SparklinePoint[];
}

export interface Notification {
  id: number;
  name: string;
  channel: NotificationChannel;
  config_json: string;
  enabled: boolean;
  created_at: string;
}

export interface AuthLoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
  session: SessionPolicy;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const data = (await response.json()) as AuthLoginResponse;
    persistSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
      session: data.session,
    });
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, options?: RequestInit, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (response.status === 401 && retry && !path.startsWith("/api/auth/")) {
    if (!refreshPromise) refreshPromise = tryRefresh().finally(() => {
      refreshPromise = null;
    });
    const ok = await refreshPromise;
    if (ok) return request<T>(path, options, false);
    clearSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login?expired=1";
    }
    throw new Error("Session expired");
  }

  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (response.status === 204) {
    return undefined as T;
  }
  touchActivity();
  return response.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthLoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false),
  register: (name: string, email: string, password: string) =>
    request<AuthLoginResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }, false),
  me: () => request<{ id: number; email: string; name: string; status: string }>("/api/auth/me"),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  dashboard: () => request<DashboardStats>("/api/dashboard"),
  servers: () => request<Server[]>("/api/servers"),
  incidents: () => request<Incident[]>("/api/incidents"),
  issues: (resolved = false) => request<Issue[]>(`/api/issues?resolved=${resolved}`),
  notifications: () => request<Notification[]>("/api/notifications"),
  serverInsights: (id: number) => request<ServerInsights>(`/api/servers/${id}/insights`),
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
  resolveIssue: (id: number) =>
    request<Issue>(`/api/issues/${id}/resolve`, { method: "POST" }),
};
