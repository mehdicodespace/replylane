export const workspaceRoutes = [
  "applications",
  "saved",
  "inboxes",
  "archive",
  "attention",
  "rejected",
  "trash",
  "settings",
] as const;
export type WorkspaceRoute = (typeof workspaceRoutes)[number];
export function workspacePath(section: string, tab = "all", demo = false) {
  const route =
    section === "connections"
      ? "inboxes"
      : section === "settings"
        ? "settings"
        : tab === "starred"
          ? "saved"
          : tab === "archive"
            ? "archive"
            : tab === "attention"
              ? "attention"
              : tab === "rejected"
                ? "rejected"
                : tab === "trash"
                  ? "trash"
                  : "applications";
  return `/${demo ? "demo" : "app"}/${route}`;
}
