import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { workspaceRoutes, type WorkspaceRoute } from "@/lib/workspace-navigation";
export const metadata = { title: "Your workspace", robots: { index: false, follow: false } };
// Authentication and workspace data are loaded on the client. The shared page
// shell can be served statically instead of starting a function for each visit.
export function generateStaticParams() {
  return workspaceRoutes.map((section) => ({ section }));
}
export const dynamicParams = false;
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!workspaceRoutes.includes(section as WorkspaceRoute)) notFound();
  return (
    <Suspense>
      <Workspace route={section as WorkspaceRoute} />
    </Suspense>
  );
}
