const features = [
  {
    eyebrow: "Health checks",
    title: "Watch every host on your terms",
    description:
      "HTTP, TCP, ping, and agent heartbeats with intervals you control. See uptime and latency without hopping between tools.",
    highlight: "Checks running",
    sub: "Homepage · API · Agent",
  },
  {
    eyebrow: "Issues & incidents",
    title: "Catch what matters, not noise",
    description:
      "OpenOps turns failed checks and metric spikes into issues and incidents you can triage, resolve, and learn from.",
    highlight: "Needs attention",
    sub: "Critical · Warning · Recovered",
  },
  {
    eyebrow: "Notifications",
    title: "Send alerts straight to your inbox",
    description:
      "Email downtime and recovery alerts to the right people so they can act immediately.",
    highlight: "Email alerts live",
    sub: "Simple · Direct · Configurable",
  },
];

export function MarketingFeatures() {
  return (
    <section className="mkt-section mkt-section-alt" id="features">
      <div className="mkt-container">
        <div className="mkt-section-head">
          <h2 className="mkt-h2">Monitor. Alert. Recover.</h2>
          <p className="mkt-lead">
            One place for fleet health, actionable issues, and the notifications that close the loop.
          </p>
        </div>
        <div className="mkt-feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="mkt-feature">
              <div className="mkt-feature-copy">
                <p className="mkt-eyebrow">{feature.eyebrow}</p>
                <h3 className="mkt-h3">{feature.title}</h3>
                <p className="mkt-body">{feature.description}</p>
              </div>
              <div className="mkt-feature-preview">
                <div className="mkt-feature-chip">
                  <strong>{feature.highlight}</strong>
                  <span>{feature.sub}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
