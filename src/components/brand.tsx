import Link from "next/link";
import { ArrowUpRight, Moon, Sun } from "lucide-react";
import { useUI } from "@/lib/store";

export function TelegramBrandMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21.5 2.5 14.4 21.1a.8.8 0 0 1-1.45.08l-4.05-7.9-7.9-4.05a.8.8 0 0 1 .08-1.45L19.7.7a1.3 1.3 0 0 1 1.8 1.8ZM8.9 13.3 21 2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`brand ${light ? "brand-light" : ""}`} aria-label="Replylane home">
      <span className="brand-mark">
        <ArrowUpRight size={23} strokeWidth={2.8} />
      </span>
      <span>
        replylane<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function ThemeToggle() {
  const { theme, setTheme } = useUI();
  return (
    <button
      className="icon-button theme-toggle"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
    >
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
