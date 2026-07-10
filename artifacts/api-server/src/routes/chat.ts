import { Router } from "express";
import OpenAI from "openai";

function getOpenAI(): OpenAI | null {
  const apiKey =
    process.env["OPENAI_API_KEY_CHAT"] ??
    process.env["OPENAI_API_KEYS"] ??
    process.env["OPENAI_API_KEY"] ??
    "";
  if (!apiKey) return null;
  const isOpenRouter = apiKey.startsWith("sk-or-");
  return new OpenAI({
    apiKey,
    ...(isOpenRouter ? { baseURL: "https://openrouter.ai/api/v1" } : {}),
  });
}

const router = Router();

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Lightweight in-memory per-IP rate limiter (no external deps) ────────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20; // requests per window per IP
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(k);
    }
  }
  return recent.length > RATE_LIMIT_MAX;
}

router.post("/chat", async (req, res) => {
  const ip =
    (req.headers["x-forwarded-for"]?.toString().split(",")[0].trim()) ||
    req.ip ||
    "unknown";
  if (rateLimited(ip)) {
    return res
      .status(429)
      .json({ error: "Too many requests. Please wait a moment and try again." });
  }

  const { messages, screenContext } = req.body as {
    messages?: ChatMessage[];
    screenContext?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  const openai = getOpenAI();
  if (!openai) {
    return res
      .status(503)
      .json({ error: "Assistant is not configured. Please try again later." });
  }

  const systemPrompt = `You are Doyang Assistant, a friendly in-app help assistant for Doyang — a creditworthiness platform that helps retailers and wholesalers understand business credit standing using M-Pesa transaction history.

The user is currently on this screen:
${screenContext || "A Doyang portal screen."}

Your job:
- Help the user understand and use the features available on their current screen.
- Answer any follow-up questions about how the app works, what a credit score/grade/limit means, how to upload statements, how report visibility/sharing works, and general usage.
- Be concise, warm, and practical. Use short paragraphs or bullet points.
- If a question is outside Doyang's scope, gently steer back to how you can help with the app. For account-specific issues you cannot resolve, suggest contacting customer support on 0114458799 or 0721628310.
- Never invent features that are not described in the screen context.`;

  const trimmed = messages.slice(-12).map((m) => ({
    role: m.role,
    content: String(m.content || "").slice(0, 4000),
  }));

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        ...trimmed,
      ],
    });

    const reply =
      response.choices[0]?.message?.content?.trim() ||
      "Sorry, I couldn't generate a response. Please try again.";

    return res.json({ reply });
  } catch (err) {
    req.log?.error({ err }, "chat completion failed");
    return res
      .status(500)
      .json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
