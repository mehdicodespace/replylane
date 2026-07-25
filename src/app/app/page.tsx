import { Suspense } from "react";
import { Workspace } from "@/components/workspace";
export const metadata = { title: "Your workspace", robots: { index: false, follow: false } };
export default function Page() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  );
}
