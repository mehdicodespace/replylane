import Link from "next/link";
import { ArrowUpRight, Moon, Sun } from "lucide-react";
import { useUI } from "@/lib/store";

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
