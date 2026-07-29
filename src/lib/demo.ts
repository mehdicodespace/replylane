import type { Application, Connection } from "./domain";

const records = [
  [
    "Linear",
    "Frontend Engineer",
    "interview",
    "en",
    "Let's meet, Mehdi",
    "Your application stood out. Pick a time for a 30-minute conversation with our engineering team.",
    "Choose a time for your introductory call.",
    0,
    "violet",
  ],
  [
    "Vercel",
    "Design Engineer",
    "next_step",
    "en",
    "Your next step at Vercel",
    "We enjoyed learning about your work. We'd love to see how you approach a small interface challenge.",
    "Review the take-home brief and confirm availability.",
    1,
    "ink",
  ],
  [
    "تپسی",
    "توسعه‌دهنده فرانت‌اند",
    "interview",
    "fa",
    "دعوت به مصاحبه فنی",
    "مهدی عزیز، رزومه شما بررسی شد. خوشحال می‌شویم برای یک جلسه مصاحبه فنی با شما هماهنگ کنیم.",
    "Reply with your availability for the technical interview.",
    1,
    "orange",
  ],
  [
    "Personio",
    "Senior React Developer",
    "received",
    "de",
    "Deine Bewerbung ist angekommen",
    "Vielen Dank für dein Interesse an Personio. Wir haben deine Bewerbung erhalten und melden uns nach der Prüfung bei dir.",
    "No action needed. The team is reviewing your application.",
    2,
    "peach",
  ],
  [
    "Figma",
    "Software Engineer, Web",
    "received",
    "en",
    "Thanks for applying to Figma",
    "Thanks for your interest in our Web Platform team. Your application is with our recruiting team for review.",
    "No action needed right now.",
    2,
    "pink",
  ],
  [
    "Doist",
    "Frontend Developer",
    "offer",
    "en",
    "We'd love you to join us",
    "We're excited to offer you the Frontend Developer role. Please review the attached offer and let us know your thoughts.",
    "Read the offer and send any questions to the recruiter.",
    3,
    "red",
  ],
  [
    "Zalando",
    "Frontend Engineer",
    "rejected",
    "de",
    "Rückmeldung zu deiner Bewerbung",
    "Vielen Dank für deine Zeit. Nach sorgfältiger Prüfung haben wir uns entschieden, mit anderen Kandidaten fortzufahren.",
    "No reply required. Keep this for your records.",
    3,
    "orange",
  ],
  [
    "دیجی‌کالا",
    "React Developer",
    "received",
    "fa",
    "دریافت درخواست همکاری",
    "درخواست همکاری شما دریافت شد. همکاران ما در تیم منابع انسانی رزومه شما را بررسی خواهند کرد.",
    "Your application is being reviewed.",
    4,
    "red",
  ],
  [
    "Notion",
    "Product Engineer",
    "review",
    "en",
    "A quick update from the team",
    "We are making some changes to the team structure and will have more information for you soon.",
    "Check the original message. The hiring outcome is unclear.",
    4,
    "ink",
  ],
  [
    "Spotify",
    "Web Engineer",
    "rejected",
    "en",
    "An update on your application",
    "Thank you for taking the time to apply. We've decided to move forward with candidates whose experience more closely matches this role.",
    "No action needed.",
    5,
    "green",
  ],
  [
    "Alan",
    "Frontend Engineer",
    "next_step",
    "fr",
    "La prochaine étape de votre candidature",
    "Merci pour notre échange. Nous souhaitons poursuivre avec un entretien technique avec deux membres de notre équipe.",
    "Confirm a time for the technical conversation.",
    6,
    "blue",
  ],
  [
    "Buffer",
    "Senior Frontend Engineer",
    "received",
    "en",
    "Your application is in good hands",
    "Thanks for applying. Our team is reviewing applications this week and will be in touch with an update.",
    "Wait for the team's response.",
    7,
    "blue",
  ],
] as const;

export function createDemoApplications(): Application[] {
  const now = new Date();
  return records.map((r, i) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - r[7]);
    date.setUTCHours(10, 20 + i, 0, 0);
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 3);
    return {
      id: `demo-${i}`,
      company: r[0],
      role: r[1],
      status: r[2],
      aiStatus: r[2],
      language: r[3],
      subject: r[4],
      excerpt: r[5],
      summary:
        r[3] === "fa"
          ? i === 2
            ? "Tapsi has invited you to a technical interview. They would like to arrange a time with you."
            : "Digikala has received your application. The recruiting team will review your résumé."
          : r[3] === "de"
            ? i === 3
              ? "Personio confirmed receipt of your application. Their team will contact you after reviewing it."
              : "Zalando has decided to move forward with other candidates."
            : r[3] === "fr"
              ? "Alan would like to continue with a technical interview with two team members."
              : r[5],
      nextAction: r[6],
      receivedAt: date.toISOString(),
      confidence: r[2] === "review" ? 0.68 : 0.94 + (i % 5) / 100,
      sender: [
        "Sarah · Linear",
        "Vercel Talent",
        "تیم جذب تپسی",
        "Lena · Personio",
        "Figma Recruiting",
        "Doist People",
        "Zalando Talent",
        "تیم جذب دیجی‌کالا",
        "Notion Recruiting",
        "Spotify Talent",
        "Alan Recruiting",
        "Buffer People",
      ][i],
      senderEmail: `careers@${["linear.app", "vercel.com", "tapsi.ir", "personio.com", "figma.com", "doist.com", "zalando.de", "digikala.com", "makenotion.com", "spotify.com", "alan.com", "buffer.com"][i]}`,
      deadline: [0, 1, 5].includes(i) ? deadline.toISOString().slice(0, 10) : null,
      starred: [0, 5].includes(i),
      archived: false,
      notes: "",
      manualStatus: false,
      connectionId: i % 3 === 0 ? "demo-outlook" : "demo-gmail",
      provider: i % 3 === 0 ? "microsoft" : "google",
      messageUrl: null,
      color: r[8],
    };
  });
}
export const demoConnections: Connection[] = [
  {
    id: "demo-gmail",
    provider: "google",
    email: "mehdi.demo@gmail.com",
    status: "connected",
    lastSyncAt: null,
    processed: 86,
    importComplete: true,
    error: null,
  },
  {
    id: "demo-outlook",
    provider: "microsoft",
    email: "mehdi.demo@outlook.com",
    status: "connected",
    lastSyncAt: null,
    processed: 32,
    importComplete: true,
    error: null,
  },
];
