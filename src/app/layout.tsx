import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "Replylane — A clearer path to your next role", template: "%s · Replylane" },
  description:
    "Turn job application emails into a calm, organized workspace. Track interviews, offers, and next steps across languages and inboxes.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
