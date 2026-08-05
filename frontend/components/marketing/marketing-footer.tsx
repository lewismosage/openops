import Link from "next/link";

const footerLinks = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#compare" },
    { label: "FAQ", href: "#faq" },
    { label: "Dashboard", href: "/dashboard" },
  ],
  Account: [
    { label: "Sign in", href: "/login" },
    { label: "Create account", href: "/register" },
  ],
};

export function MarketingFooter() {
  return (
    <footer className="mkt-footer mkt-footer-muted">
      <div className="mkt-footer-inner">
        <div className="mkt-footer-brand">
          <div className="mkt-brand">
            <span className="mkt-brand-mark">O</span>
            <span className="mkt-brand-name">OpenOps</span>
          </div>
          <p>
            Server monitoring that connects health checks, issues, and alerts — so you recover faster.
          </p>
        </div>
        {Object.entries(footerLinks).map(([title, links]) => (
          <div key={title}>
            <p className="mkt-footer-title">{title}</p>
            <ul>
              {links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mkt-footer-copy">© {new Date().getFullYear()} OpenOps — Monitor · alert · recover</p>
    </footer>
  );
}
