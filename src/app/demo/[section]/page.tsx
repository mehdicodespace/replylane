import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { workspaceRoutes, type WorkspaceRoute } from "@/lib/workspace-navigation";
export const metadata = { title: "Demo workspace" };
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!workspaceRoutes.includes(section as WorkspaceRoute)) notFound();
  return (
    <Suspense>
      <Workspace demo route={section as WorkspaceRoute} />
    </Suspense>
  );
}
