import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameDemo } from "@/games/demos";
import { games, getGame } from "@/games/registry";
import { CopyButton } from "../../CopyButton";

export const dynamicParams = false;

export function generateStaticParams() {
  return games.map((game) => ({ slug: game.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = getGame((await params).slug);
  return game ? { title: `${game.name} · Games`, description: game.description } : {};
}

// Pages are generated at build time, so the source files are read once during `next build`.
async function readSource(slug: string) {
  const dir = path.join(process.cwd(), "src", "games", slug);
  const names = (await fs.readdir(dir)).sort();
  return Promise.all(
    names.map(async (name) => ({ name, code: await fs.readFile(path.join(dir, name), "utf8") })),
  );
}

export default async function GamePage({ params }: Props) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  const files = await readSource(slug);
  const index = games.indexOf(game);
  const prev = games[index - 1];
  const next = games[index + 1];

  return (
    <main className="container">
      <Link href="/#games" className="back">
        ← All games
      </Link>
      <header className="detail-head">
        <span className="tag">Game · {game.addedOn}</span>
        <h1>{game.name}</h1>
        <p>{game.description}</p>
      </header>

      <section className="stage" aria-label="Play">
        <GameDemo slug={game.slug} />
      </section>

      <section className="source">
        <h2>Source</h2>
        {files.map((file) => (
          <div key={file.name} className="file">
            <div className="file-head">
              <span>{file.name}</span>
              <CopyButton text={file.code} />
            </div>
            <pre>
              <code>{file.code}</code>
            </pre>
          </div>
        ))}
      </section>

      <nav className="pager">
        {prev ? <Link href={`/games/${prev.slug}`}>← {prev.name}</Link> : <span />}
        {next ? <Link href={`/games/${next.slug}`}>{next.name} →</Link> : <span />}
      </nav>
    </main>
  );
}
