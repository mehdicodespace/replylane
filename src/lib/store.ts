"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Application, ApplicationPatch } from "./domain";
import { createDemoApplications } from "./demo";

interface UIState {
  theme: "light" | "dark";
  view: "board" | "list";
  setTheme: (theme: "light" | "dark") => void;
  setView: (view: "board" | "list") => void;
}
export const useUI = create<UIState>()(
  persist(
    (set) => ({
      theme: "light",
      view: "board",
      setTheme: (theme) => set({ theme }),
      setView: (view) => set({ view }),
    }),
    { name: "replylane-preferences", skipHydration: true },
  ),
);

interface DemoState {
  applications: Application[];
  patch: (id: string, patch: ApplicationPatch) => void;
  reset: () => void;
}
export const useDemo = create<DemoState>()(
  persist(
    (set) => ({
      applications: createDemoApplications(),
      patch: (id, patch) =>
        set((s) => ({
          applications: s.applications.map((a) =>
            a.id === id ? { ...a, ...patch, ...(patch.status ? { manualStatus: true } : {}) } : a,
          ),
        })),
      reset: () => set({ applications: createDemoApplications() }),
    }),
    { name: "replylane-demo-v1", skipHydration: true },
  ),
);
