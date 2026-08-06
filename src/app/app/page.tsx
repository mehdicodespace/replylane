import { redirect } from "next/navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const route =
    p.section === "connections"
      ? "inboxes"
      : p.section === "settings"
        ? "settings"
        : "applications";
  const connection =
    typeof p.connection === "string" ? `?connection=${encodeURIComponent(p.connection)}` : "";
  redirect(`/app/${route}${connection}`);
}
