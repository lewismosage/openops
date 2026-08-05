"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { clearSession, persistSession } from "@/lib/auth";

function authErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    const detail = parsed.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  } catch {
    // not JSON
  }
  return err.message || fallback;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const expired = params.get("expired") === "1";

  useEffect(() => {
    clearSession();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.login(email.trim(), password);
      clearSession();
      persistSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
        session: data.session,
      });
      router.replace("/");
    } catch (err) {
      setError(authErrorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <div className="login-brand">
        <div className="brand-mark">O</div>
        <div>
          <h1>OpenOps</h1>
          <p className="muted">Sign in to manage your servers</p>
        </div>
      </div>

      {expired && <div className="error-banner">Your session expired. Please sign in again.</div>}
      {error && <div className="error-banner">{error}</div>}

      <label className="login-label">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />
      </label>
      <label className="login-label">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      <button className="primary-btn" type="submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
      <p className="login-switch muted">
        New here? <Link href="/register">Create an account</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login-page">
      <Suspense fallback={<div className="login-card muted">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
