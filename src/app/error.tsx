"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="not-found">
      <span>Let’s try that again.</span>
      <h1>A little interruption.</h1>
      <p>Your inbox hasn’t been changed. Try reloading this page.</p>
      <button onClick={reset} className="button button-dark">
        Try again ↗
      </button>
    </main>
  );
}
