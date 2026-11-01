import type { Metadata } from "next";
import { JetBrains_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import { InView } from "@/components/landing/InView";
import { DEMO_MODE } from "@/lib/config";
import { run, txLink } from "@/lib/fixture";
import "./globals.css";

// next/font self-hosts both families at build time, so pages make no font requests.
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Settled",
  description: "A retry through Settled never pays twice. A NEAR contract refuses a repeated key and refunds it in the same transaction.",
};

function DemoBanner() {
  const tx = run.refusal?.tx_hash ?? run.steps[0]?.tx_hash ?? "";
  const link = txLink(tx);
  return (
    <div className="banner" data-testid="demo-banner" role="status">
      <div className="wrap">
        DEMO MODE: replaying a recorded run (source:{" "}
        <span data-testid="demo-banner-source">{run.source}</span>, recorded {run.recorded_at.slice(0, 10)}, tx{" "}
        <a data-testid="demo-banner-tx-link" href={link.href}>{link.text}</a>)
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script marks JS as available before first paint, so reveal animations hide
    // content only when they can show it again; without JS everything renders visible.
    <html lang="en" className={`${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand">Settled</Link>
            <nav className="nav" aria-label="Main">
              <Link href="/console" data-testid="nav-console">Console</Link>
              <Link href="/outcomes" data-testid="nav-outcomes">Outcomes</Link>
            </nav>
            <span className="badge" data-testid="mode-badge">{DEMO_MODE ? "DEMO MODE" : "LIVE READS"}</span>
          </div>
        </header>
        {DEMO_MODE ? <DemoBanner /> : null}
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <InView className="perf" aria-hidden="true" />
          </div>
          <div className="wrap small">
            This site reads chain only. It never calls 1Click and never holds a payer key. Open source, MIT.
          </div>
        </footer>
      </body>
    </html>
  );
}
