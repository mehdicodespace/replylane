"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { signOut } from "firebase/auth";
import { useAuth } from "./providers";
import { clientAuth } from "@/lib/firebase-client";

export function AccountMenu() {
  const { user } = useAuth();
  const router = useRouter();
  if (!user) return null;
  const name = user.displayName || "Your account";
  const email = user.email || "";
  const initial = (user.displayName || user.email || "M").slice(0, 1).toUpperCase();

  return (
    <div className="account-menu-wrap">
      <div
        className="account-menu-trigger"
        role="group"
        tabIndex={0}
        aria-label={`${name}, ${email}. Focus or hover for account options.`}
      >
        <span className="header-avatar">{initial}</span>
        <span className="account-menu-inline-identity">
          <strong>{name}</strong>
          <span>{email}</span>
        </span>
      </div>
      <div className="account-menu-panel" role="menu" aria-label="Account options">
        <Link href="/app/settings" role="menuitem">
          <Settings size={16} /> Settings
        </Link>
        <button
          type="button"
          role="menuitem"
          onClick={async () => {
            await signOut(clientAuth());
            router.push("/");
          }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}
