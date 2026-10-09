import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/site";
import "./globals.css";

export const metadata: Metadata = {
  title: site.title,
  description: site.description,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              {site.title}
            </Link>
            <nav>
              <Link href="/#games">Games</Link>
              <a href={site.repoUrl}>GitHub</a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="container">
            <span>Built by {site.author} · LofiStack 90-day challenge</span>
            <a href={site.repoUrl}>Source on GitHub</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
