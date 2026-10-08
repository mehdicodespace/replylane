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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{const p=JSON.parse(localStorage.getItem("replylane-preferences")||"{}");const t=p?.state?.theme==="dark"?"dark":"light";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch{document.documentElement.dataset.theme="light";document.documentElement.style.colorScheme="light"}})()`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
