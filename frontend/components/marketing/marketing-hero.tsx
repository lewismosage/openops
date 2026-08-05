import Link from "next/link";

const fleet = [
  { name: "api.production", status: "healthy", uptime: "100%", latency: "42ms" },
  { name: "web.edge", status: "healthy", uptime: "99.9%", latency: "68ms" },
  { name: "workers.queue", status: "degraded", uptime: "98.4%", latency: "210ms" },
];

export function MarketingHero() {
  return (
    <section className="mkt-hero">
      <div className="mkt-hero-glow" aria-hidden />
      <div className="mkt-hero-inner">
        <p className="mkt-brand-signal">OpenOps</p>
        <h1 className="mkt-hero-title">Know when your servers fail — before your users do.</h1>
        <p className="mkt-hero-sub">
          Monitor hosts with health checks, surface issues and incidents, and get alerts the moment
          something drifts — so you can recover faster.
        </p>
        <div className="mkt-hero-ctas">
          <Link href="/register" className="mkt-btn mkt-btn-primary mkt-btn-lg">
            Get started
          </Link>
          <Link href="/login" className="mkt-btn mkt-btn-ghost mkt-btn-lg">
            Sign in
          </Link>
        </div>
      </div>

      <div className="mkt-hero-visual" aria-hidden>
        <div className="mkt-mock">
          <div className="mkt-mock-chrome">
            <span />
            <span />
            <span />
            <em>OpenOps — Servers</em>
          </div>
          <div className="mkt-mock-body">
            <div className="mkt-mock-rail">
              <p className="mkt-mock-label">Fleet</p>
              <div className="mkt-mock-stat">
                <span>3 servers</span>
                <strong>2 healthy</strong>
              </div>
              <div className="mkt-mock-stat warn">
                <span>Open issues</span>
                <strong>1</strong>
              </div>
            </div>
            <div className="mkt-mock-list">
              {fleet.map((server) => (
                <div key={server.name} className={`mkt-mock-row ${server.status}`}>
                  <div>
                    <strong>{server.name}</strong>
                    <span>Uptime {server.uptime} · Avg {server.latency}</span>
                  </div>
                  <em>{server.status}</em>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
