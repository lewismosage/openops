const integrations = [
  "HTTP",
  "TCP",
  "Ping",
  "Agent",
  "Discord",
  "Telegram",
  "Webhook",
  "Email",
  "Vercel",
  "Linux",
  "Docker",
  "FastAPI",
];

export function MarketingIntegrations() {
  const items = [...integrations, ...integrations];

  return (
    <section className="mkt-section mkt-section-muted mkt-integrations">
      <div className="mkt-container mkt-section-head">
        <h2 className="mkt-h2">Built for the stack you already run</h2>
        <p className="mkt-lead">Checks, agents, and alert channels that fit modern ops workflows.</p>
      </div>
      <div className="mkt-marquee-wrap">
        <div className="mkt-marquee">
          {items.map((name, index) => (
            <span key={`${name}-${index}`} className="mkt-marquee-item">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
