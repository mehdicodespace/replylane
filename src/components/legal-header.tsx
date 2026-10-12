"use client";
import Link from "next/link";
import { Brand, ThemeToggle } from "./brand";
import { AccountMenu } from "./account-menu";
import { useAuth } from "./providers";

export function LegalHeader() {
  const { user, loading } = useAuth();
  return (
    <header className="legal-header">
      <div className="legal-header-inner">
        <Brand />
        <nav aria-label="Main navigation">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/">Home</Link>
        </nav>
        <div className="legal-header-actions">
          <ThemeToggle />
          {!loading &&
            (user ? (
              <AccountMenu />
            ) : (
              <>
                <Link className="nav-login" href="/sign-in">
                  Log in
                </Link>
                <Link className="button button-dark button-small" href="/sign-up">
                  Create account
                </Link>
              </>
            ))}
        </div>
      </div>
    </header>
  );
}
