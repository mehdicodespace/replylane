import { describe, expect, it } from "vitest";
import { workspacePath, workspaceRouteFromPath, workspaceRoutes } from "@/lib/workspace-navigation";

describe("workspace URL navigation", () => {
  it("resolves every view when navigating directly or through browser history", () => {
    for (const route of workspaceRoutes) {
      expect(workspaceRouteFromPath(`/app/${route}`)).toBe(route);
      expect(workspaceRouteFromPath(`/app/${route}/`)).toBe(route);
      expect(workspaceRouteFromPath(`/demo/${route}`, true)).toBe(route);
    }
  });

  it("keeps inbox, settings, and application tab URLs compatible", () => {
    expect(workspaceRouteFromPath(workspacePath("connections"))).toBe("inboxes");
    expect(workspaceRouteFromPath(workspacePath("settings"))).toBe("settings");
    expect(workspaceRouteFromPath(workspacePath("applications", "attention"))).toBe("attention");
    expect(workspaceRouteFromPath(workspacePath("applications", "starred"))).toBe("saved");
  });

  it("does not treat another page or an invalid URL as a workspace view", () => {
    for (const pathname of [
      "/",
      "/privacy",
      "/app",
      "/app/unknown",
      "/app/inboxes/details",
      "/demo/inboxes",
    ]) {
      expect(workspaceRouteFromPath(pathname)).toBeNull();
    }
  });
});
