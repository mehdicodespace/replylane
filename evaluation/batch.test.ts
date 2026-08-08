import { it, expect } from "vitest";
import { buildBatchClassificationBody } from "@/lib/server/ai";
import { safeClassification } from "@/lib/domain";
import { fixtures } from "./fixtures";
it("classifies multilingual synthetic responses in indexed batches", async () => {
  if (!process.env.GROQ_API_KEY) throw new Error("Configure the hosted service key first.");
  for (let start = 0; start < fixtures.length; start += 6) {
    if (start) await new Promise((r) => setTimeout(r, 20000));
    const sample = fixtures.slice(start, start + 6);
    const mails = sample.map((f, i) => ({
      id: `batch-${start + i}`,
      threadId: `thread-${start + i}`,
      subject: f.subject,
      text: f.text,
      sender: "Example Recruiting",
      senderEmail: "recruiting@example.com",
      receivedAt: "2026-10-21T12:00:00Z",
      messageUrl: null,
    }));
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildBatchClassificationBody(mails)),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Batch evaluation returned HTTP ${response.status}`);
    const data = await response.json();
    expect(data.choices[0].finish_reason).toBe("stop");
    const { results } = JSON.parse(data.choices[0].message.content);
    expect(results).toHaveLength(sample.length);
    expect(new Set(results.map((r: { index: number }) => r.index)).size).toBe(sample.length);
    for (const [i, f] of sample.entries()) {
      const actual = safeClassification(
        results.find((r: { index: number }) => r.index === i)?.classification,
      );
      expect(actual.relevant ? actual.status : "irrelevant", f.name).toBe(
        f.relevant ? f.status : "irrelevant",
      );
    }
  }
}, 120000);
