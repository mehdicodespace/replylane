import { it, expect } from "vitest";
import { buildClassificationBody } from "@/lib/server/ai";
import { safeClassification } from "@/lib/domain";
import { fixtures } from "./fixtures";

it("checks the configured hosted model against synthetic multilingual responses", async () => {
  if (!process.env.GROQ_API_KEY)
    throw new Error("Set GROQ_API_KEY in .env.local before running this opt-in evaluation.");
  const results: { name: string; expected: string; actual: string; tokens: number }[] = [];
  for (const [index, fixture] of fixtures.entries()) {
    if (index)
      await new Promise((resolve) =>
        setTimeout(resolve, Number(process.env.AI_MIN_INTERVAL_MS || 8000)),
      );
    const body = buildClassificationBody({
      id: `fixture-${index}`,
      threadId: `fixture-${index}`,
      subject: fixture.subject,
      sender: "Example Recruiting",
      senderEmail: "recruiting@example.com",
      receivedAt: "2026-10-21T12:00:00Z",
      text: fixture.text,
      messageUrl: null,
    });
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        `AI evaluation stopped at HTTP ${response.status}. Check your provider allowance and model access.`,
      );
    const data = await response.json();
    const actual = safeClassification(JSON.parse(data.choices[0].message.content));
    results.push({
      name: fixture.name,
      expected: fixture.relevant ? fixture.status! : "irrelevant",
      actual: actual.relevant ? actual.status : "irrelevant",
      tokens: data.usage?.total_tokens || 0,
    });
  }
  console.table(results);
  console.log(`Total reported tokens: ${results.reduce((sum, row) => sum + row.tokens, 0)}`);
  for (const row of results) expect(row.actual, row.name).toBe(row.expected);
}, 300000);
