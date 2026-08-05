"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setResetUrl(null);
    try {
      const data = await api.forgotPassword(email.trim());
      setMessage(data.message);
      if (data.reset_url) setResetUrl(data.reset_url);
    } catch (err) {
      setError(authErrorMessage(err, "Could not start password reset"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-glow" aria-hidden />
      <form className="auth-card" onSubmit={handleSubmit}>
        <Link href="/" className="auth-brand">
          <span className="mkt-brand-mark">O</span>
          <div>
            <h1>OpenOps</h1>
            <p>Reset your password</p>
          </div>
        </Link>

        {error && <div className="error-banner">{error}</div>}
        {message && !error && <div className="success-banner">{message}</div>}

        {!resetUrl ? (
          <>
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
            <button className="mkt-btn mkt-btn-primary mkt-btn-lg auth-submit" type="submit" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </>
        ) : (
          <div className="auth-reset-actions">
            <a className="mkt-btn mkt-btn-primary mkt-btn-lg auth-submit" href={resetUrl}>
              Continue to reset password
            </a>
            <button
              type="button"
              className="mkt-btn mkt-btn-ghost"
              onClick={() => {
                setMessage(null);
                setResetUrl(null);
              }}
            >
              Use a different email
            </button>
          </div>
        )}

        <p className="auth-switch">
          Remembered it? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
