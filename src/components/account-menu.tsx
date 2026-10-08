"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu as PopupMenu, MenuItem } from "@mui/material";
import { LogOut, Settings } from "lucide-react";
import { signOut } from "firebase/auth";
import { useAuth } from "./providers";
import { clientAuth } from "@/lib/firebase-client";

export function AccountMenu({ showLabel = false }: { showLabel?: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!user) return null;
  const name = user.displayName || "Your account";
  const email = user.email || "";
  const initial = (user.displayName || user.email || "M").slice(0, 1).toUpperCase();

  return (
    <>
      <button
        className={`account-menu-trigger${showLabel ? " with-label" : ""}`}
        aria-label={`Account menu for ${name}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <span className="header-avatar">{initial}</span>
        {showLabel && <span>My workspace</span>}
        <span className="account-menu-caret" aria-hidden="true">
          ⌄
        </span>
      </button>
      <PopupMenu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { className: "account-menu-popup" } }}
      >
        <div className="account-menu-identity">
          <strong>{name}</strong>
          <span>{email}</span>
        </div>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            router.push("/app/settings");
          }}
        >
          <Settings size={16} /> Settings
        </MenuItem>
        <MenuItem
          onClick={async () => {
            setAnchor(null);
            await signOut(clientAuth());
            router.push("/");
          }}
        >
          <LogOut size={16} /> Sign out
        </MenuItem>
      </PopupMenu>
    </>
  );
}
