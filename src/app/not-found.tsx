import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <header className="hero">
        <h1>Not found</h1>
        <p className="lede">That component doesn&apos;t exist (yet).</p>
        <Link href="/">← Back to the gallery</Link>
      </header>
    </main>
  );
}
