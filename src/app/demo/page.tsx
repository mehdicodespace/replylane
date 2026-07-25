import { Suspense } from "react";
import { Workspace } from "@/components/workspace";
export const metadata = { title: "Demo workspace" };
export default function Page() {
  return (
    <Suspense>
      <Workspace demo />
    </Suspense>
  );
}
