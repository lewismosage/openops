"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isAuthenticated } from "@/lib/auth";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#compare" },
  { label: "FAQ", href: "#faq" },
];

export function MarketingNavbar() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(isAuthenticated());
  }, []);

  return (
    <header className="mkt-header">
      <div className="mkt-nav">
        <Link href="/" className="mkt-brand">
          <span className="mkt-brand-mark">O</span>
          <span className="mkt-brand-name">OpenOps</span>
        </Link>

        <nav className="mkt-nav-links" aria-label="Marketing">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="mkt-nav-link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="mkt-nav-actions">
          {authed ? (
            <Link href="/dashboard" className="mkt-btn mkt-btn-primary">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="mkt-btn mkt-btn-ghost">
                Sign in
              </Link>
              <Link href="/register" className="mkt-btn mkt-btn-primary">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
