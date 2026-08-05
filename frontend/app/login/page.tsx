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
      router.replace("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <Link href="/" className="auth-brand">
        <span className="mkt-brand-mark">O</span>
        <div>
          <h1>OpenOps</h1>
          <p>Sign in to manage your servers</p>
        </div>
      </Link>

      {expired && <div className="error-banner">Your session expired. Please sign in again.</div>}
      {error && <div className="error-banner">{error}</div>}

      <label className="auth-label">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />
      </label>
      <label className="auth-label">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      <div className="auth-forgot-row">
        <Link href="/forgot-password">Forgot password?</Link>
      </div>
      <button className="mkt-btn mkt-btn-primary mkt-btn-lg auth-submit" type="submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
      <p className="auth-switch">
        New here? <Link href="/register">Create an account</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-glow" aria-hidden />
      <Suspense fallback={<div className="auth-card">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
