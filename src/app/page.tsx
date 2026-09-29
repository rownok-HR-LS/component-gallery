import Link from "next/link";
import { gallery } from "@/gallery/registry";

const GOAL = 30;

export default function Home() {
  const entries = [...gallery].reverse();

  return (
    <main className="container">
      <header className="hero">
        <p className="eyebrow">LofiStack 90-day challenge</p>
        <h1>Component Gallery</h1>
        <p className="lede">
          Two new UI components every week. Each one has its own page with a live demo and the full source.
        </p>
        <div className="progress">
          <div className="progress-label">
            <span>Progress</span>
            <span>
              {gallery.length} / {GOAL} components
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(100, (gallery.length / GOAL) * 100)}%` }} />
          </div>
        </div>
      </header>

      {entries.length === 0 ? (
        <p className="empty">The first components are on their way.</p>
      ) : (
        <ul className="grid">
          {entries.map((entry) => (
            <li key={entry.slug} className="card">
              <div className="card-preview">
                <entry.Demo />
              </div>
              <div className="card-body">
                <span className="tag">Week {entry.week}</span>
                <h2>
                  <Link href={`/components/${entry.slug}`}>{entry.name}</Link>
                </h2>
                <p>{entry.description}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
