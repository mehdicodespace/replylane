import Link from "next/link";
export default function NotFound() {
  return (
    <main className="not-found">
      <span>404</span>
      <h1>A small detour.</h1>
      <p>This page isn’t here, but your next chapter is.</p>
      <Link href="/" className="button button-dark">
        Back to Replylane ↗
      </Link>
    </main>
  );
}
