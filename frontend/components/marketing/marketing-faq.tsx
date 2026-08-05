"use client";

import { useState } from "react";

const faqs = [
  {
    q: "What is OpenOps?",
    a: "OpenOps is a server monitoring hub. You register hosts, attach health checks, review issues and incidents, and get notified when something fails or recovers.",
  },
  {
    q: "What can I monitor?",
    a: "HTTP endpoints, TCP ports, ping targets, and agent heartbeats. Each server can have multiple checks with its own interval and expected status.",
  },
  {
    q: "How do notifications work?",
    a: "Connect Discord, Telegram, webhook, or email channels. When checks fail or recover, OpenOps can push alerts to the channels you enable.",
  },
  {
    q: "Do I need an agent on every server?",
    a: "No. Many hosts can be monitored with remote HTTP/TCP/ping checks. Agents are optional when you want heartbeats and deeper host signals.",
  },
  {
    q: "How do accounts work?",
    a: "Create an account, then add servers under that account. Your fleet, issues, and notification channels stay scoped to you.",
  },
  {
    q: "How do I get started?",
    a: "Register, add a server, attach a health check, and optionally wire a notification channel. The dashboard updates as checks run.",
  },
];

export function MarketingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="mkt-section" id="faq">
      <div className="mkt-container mkt-faq">
        <h2 className="mkt-h2">Frequently asked questions</h2>
        <div className="mkt-faq-list">
          {faqs.map((faq, index) => {
            const open = openIndex === index;
            return (
              <div key={faq.q} className="mkt-faq-item">
                <button
                  type="button"
                  className="mkt-faq-q"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  <span>{faq.q}</span>
                  <span className={`mkt-faq-chevron ${open ? "open" : ""}`} aria-hidden>
                    ▾
                  </span>
                </button>
                {open ? <p className="mkt-faq-a">{faq.a}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
