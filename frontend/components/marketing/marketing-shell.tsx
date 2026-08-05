import { ReactNode } from "react";

export function MarketingShell({ children }: { children: ReactNode }) {
  return <div className="mkt-shell">{children}</div>;
}
