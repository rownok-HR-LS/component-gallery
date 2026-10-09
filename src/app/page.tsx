import Link from "next/link";
import { Demo } from "@/gallery/demos";
import { gallery } from "@/gallery/registry";
import { games } from "@/games/registry";

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
                <Demo slug={entry.slug} />
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

      {games.length > 0 && (
        <section id="games" className="games">
          <h2>Games</h2>
          <p className="section-note">Side projects, separate from the weekly component challenge.</p>
          <ul className="grid">
            {games.map((game) => (
              <li key={game.slug} className="card">
                <div className={`card-preview poster poster-${game.slug}`} aria-hidden="true">
                  <span className="poster-title">{game.name}</span>
                  <span className="poster-tagline">{game.tagline}</span>
                </div>
                <div className="card-body">
                  <span className="tag">Game</span>
                  <h2>
                    <Link href={`/games/${game.slug}`}>{game.name}</Link>
                  </h2>
                  <p>{game.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
