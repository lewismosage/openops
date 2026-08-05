import Link from "next/link";

export function MarketingCta() {
  return (
    <section className="mkt-cta-wrap">
      <div className="mkt-cta">
        <h2 className="mkt-h2">See problems before they become outages.</h2>
        <p className="mkt-lead">Create an account and put your first server under watch in minutes.</p>
        <Link href="/register" className="mkt-btn mkt-btn-on-dark mkt-btn-lg">
          Get started
        </Link>
      </div>
    </section>
  );
}
