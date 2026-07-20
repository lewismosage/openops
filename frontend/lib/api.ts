export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type ServerStatus = "healthy" | "degraded" | "down" | "unknown";

export interface DashboardStats {
  total_servers: number;
  healthy: number;
  degraded: number;
  down: number;
  unknown: number;
  open_incidents: number;
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
  agent_token: string | null;
  created_at: string;
}

export interface Incident {
  id: number;
  server_id: number;
  title: string;
  message: string;
  severity: string;
  resolved: boolean;
  started_at: string;
  resolved_at: string | null;
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
  return response.json();
}

export const api = {
  dashboard: () => request<DashboardStats>("/api/dashboard"),
  servers: () => request<Server[]>("/api/servers"),
  incidents: () => request<Incident[]>("/api/incidents"),
  createServer: (data: { name: string; host: string; environment: string; description?: string }) =>
    request<Server>("/api/servers", { method: "POST", body: JSON.stringify(data) }),
  createNotification: (data: { name: string; channel: string; config_json: string }) =>
    request("/api/notifications", { method: "POST", body: JSON.stringify({ ...data, enabled: true }) }),
};
