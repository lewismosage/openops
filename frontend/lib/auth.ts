const ACCESS_KEY = "openops_access_token";
const REFRESH_KEY = "openops_refresh_token";
const LOGIN_AT_KEY = "openops_login_at";
const ACTIVITY_KEY = "openops_last_activity";
const USER_KEY = "openops_user";
const SESSION_POLICY_KEY = "openops_session_policy";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  status: string;
};

export type SessionPolicy = {
  inactivity_timeout_minutes: number;
  absolute_timeout_hours: number;
};

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function getSessionPolicy(): SessionPolicy {
  if (typeof window === "undefined") {
    return { inactivity_timeout_minutes: 60, absolute_timeout_hours: 24 };
  }
  const raw = localStorage.getItem(SESSION_POLICY_KEY);
  if (!raw) return { inactivity_timeout_minutes: 60, absolute_timeout_hours: 24 };
  try {
    return JSON.parse(raw) as SessionPolicy;
  } catch {
    return { inactivity_timeout_minutes: 60, absolute_timeout_hours: 24 };
  }
}

export function persistSession(data: {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
  session?: SessionPolicy;
}) {
  localStorage.setItem(ACCESS_KEY, data.access_token);
  localStorage.setItem(REFRESH_KEY, data.refresh_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  if (data.session) {
    localStorage.setItem(SESSION_POLICY_KEY, JSON.stringify(data.session));
  }
  const now = String(Date.now());
  if (!localStorage.getItem(LOGIN_AT_KEY)) {
    localStorage.setItem(LOGIN_AT_KEY, now);
  }
  localStorage.setItem(ACTIVITY_KEY, now);
}

export function touchActivity() {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
}

export function clearSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LOGIN_AT_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
  localStorage.removeItem(SESSION_POLICY_KEY);
}

export function getSessionExpiryReason(): "inactivity" | "absolute" | null {
  if (typeof window === "undefined") return null;
  const policy = getSessionPolicy();
  const loginAt = Number(localStorage.getItem(LOGIN_AT_KEY) || 0);
  const lastActivity = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
  const now = Date.now();
  if (loginAt && now - loginAt > policy.absolute_timeout_hours * 60 * 60 * 1000) {
    return "absolute";
  }
  if (lastActivity && now - lastActivity > policy.inactivity_timeout_minutes * 60 * 1000) {
    return "inactivity";
  }
  return null;
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}
