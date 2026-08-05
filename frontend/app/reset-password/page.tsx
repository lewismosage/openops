"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

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

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError("Invalid or missing reset link");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      window.setTimeout(() => router.replace("/login"), 1500);
    } catch (err) {
      setError(authErrorMessage(err, "Could not reset password"));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-card">
        <Link href="/" className="auth-brand">
          <span className="mkt-brand-mark">O</span>
          <div>
            <h1>OpenOps</h1>
            <p>Invalid reset link</p>
          </div>
        </Link>
        <div className="error-banner">This password reset link is missing or invalid.</div>
        <Link href="/forgot-password" className="mkt-btn mkt-btn-primary mkt-btn-lg auth-submit">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-card">
        <Link href="/" className="auth-brand">
          <span className="mkt-brand-mark">O</span>
          <div>
            <h1>OpenOps</h1>
            <p>Password updated</p>
          </div>
        </Link>
        <div className="success-banner">Your password was reset. Redirecting to sign in…</div>
        <Link href="/login" className="mkt-btn mkt-btn-primary mkt-btn-lg auth-submit">
          Sign in now
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <Link href="/" className="auth-brand">
        <span className="mkt-brand-mark">O</span>
        <div>
          <h1>OpenOps</h1>
          <p>Choose a new password</p>
        </div>
      </Link>

      {error && <div className="error-banner">{error}</div>}

      <label className="auth-label">
        New password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <label className="auth-label">
        Confirm password
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <button className="mkt-btn mkt-btn-primary mkt-btn-lg auth-submit" type="submit" disabled={loading}>
        {loading ? "Updating…" : "Update password"}
      </button>
      <p className="auth-switch">
        <Link href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="auth-page">
      <div className="auth-glow" aria-hidden />
      <Suspense fallback={<div className="auth-card">Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
