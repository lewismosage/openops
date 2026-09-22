import { MarketingComparison } from "@/components/marketing/marketing-comparison";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { MarketingFaq } from "@/components/marketing/marketing-faq";
import { MarketingFeatures } from "@/components/marketing/marketing-features";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingIntegrations } from "@/components/marketing/marketing-integrations";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import { MarketingShell } from "@/components/marketing/marketing-shell";


export default function HomePage() {
  return (
    <MarketingShell>
      <MarketingNavbar />
      <main>
        <MarketingHero />
        <MarketingFeatures />
        <MarketingIntegrations />
        <MarketingComparison />
        <MarketingFaq />
        <MarketingCta />
      </main>
      <MarketingFooter />
    </MarketingShell>
  );
}
