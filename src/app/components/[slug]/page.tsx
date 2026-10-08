import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Demo } from "@/gallery/demos";
import { gallery, getEntry } from "@/gallery/registry";
import { CopyButton } from "../../CopyButton";

export const dynamicParams = false;

export function generateStaticParams() {
  return gallery.map((entry) => ({ slug: entry.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const entry = getEntry((await params).slug);
  return entry ? { title: `${entry.name} · Component Gallery`, description: entry.description } : {};
}

// Pages are generated at build time, so the source files are read once during `next build`.
async function readSource(slug: string) {
  const dir = path.join(process.cwd(), "src", "gallery", slug);
  const names = (await fs.readdir(dir)).sort();
  return Promise.all(
    names.map(async (name) => ({ name, code: await fs.readFile(path.join(dir, name), "utf8") })),
  );
}

export default async function ComponentPage({ params }: Props) {
  const { slug } = await params;
  const entry = getEntry(slug);
  if (!entry) notFound();

  const files = await readSource(slug);
  const index = gallery.indexOf(entry);
  const prev = gallery[index - 1];
  const next = gallery[index + 1];

  return (
    <main className="container">
      <Link href="/" className="back">
        ← All components
      </Link>
      <header className="detail-head">
        <span className="tag">
          Week {entry.week} · {entry.addedOn}
        </span>
        <h1>{entry.name}</h1>
        <p>{entry.description}</p>
      </header>

      <section className="stage" aria-label="Live demo">
        <Demo slug={entry.slug} />
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
        {prev ? <Link href={`/components/${prev.slug}`}>← {prev.name}</Link> : <span />}
        {next ? <Link href={`/components/${next.slug}`}>{next.name} →</Link> : <span />}
      </nav>
    </main>
  );
}
