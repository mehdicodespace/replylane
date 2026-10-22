export const workspaceRoutes = [
  "applications",
  "saved",
  "inboxes",
  "archive",
  "attention",
  "review",
  "rejected",
  "received",
  "trash",
  "settings",
] as const;
export type WorkspaceRoute = (typeof workspaceRoutes)[number];
export function workspaceRouteFromPath(pathname: string, demo = false): WorkspaceRoute | null {
  const prefix = demo ? "/demo/" : "/app/";
  if (!pathname.startsWith(prefix)) return null;
  const route = pathname.slice(prefix.length).replace(/\/$/, "") as WorkspaceRoute;
  return workspaceRoutes.includes(route) ? route : null;
}
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
              : tab === "review"
                ? "review"
                : tab === "rejected"
                  ? "rejected"
                  : tab === "received"
                    ? "received"
                    : tab === "trash"
                      ? "trash"
                      : "applications";
  return `/${demo ? "demo" : "app"}/${route}`;
}
