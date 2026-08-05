export function MarketingComparison() {
  return (
    <section className="mkt-section mkt-compare" id="compare">
      <div className="mkt-container mkt-compare-grid">
        <div>
          <h2 className="mkt-h2">See the whole loop.</h2>
          <p className="mkt-lead">
            Point uptime tools tell you something is down. OpenOps connects checks, issues, incidents,
            and alerts so you can move from signal to recovery in one place.
          </p>
        </div>
        <div className="mkt-compare-cards">
          <div className="mkt-compare-card mkt-compare-card-primary">
            <p className="mkt-eyebrow">OpenOps</p>
            <h3 className="mkt-h3">Connected ops</h3>
            <ul>
              <li>Health checks</li>
              <li>Issues & incidents</li>
              <li>Fleet insights</li>
              <li>Channel alerts</li>
            </ul>
            <p className="mkt-compare-foot">Monitor · alert · recover</p>
          </div>
          <div className="mkt-compare-card">
            <p className="mkt-eyebrow muted">Point tools</p>
            <h3 className="mkt-h3">Separate signals</h3>
            <ul>
              <li>Uptime pings</li>
              <li>Scattered alerts</li>
              <li>No issue trail</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
