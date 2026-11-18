// PaperReady: generate-quiz Edge Function
// Creates MCQs with Gemini or OpenAI from a topic or from PDF text, and can double-check the answers.
// Secrets to set in Supabase (Edge Functions > Secrets):
//   GEMINI_API_KEY   key from Google AI Studio (free tier available)
//   OPENAI_API_KEY   key from platform.openai.com (needs prepaid credit)
//   AI_PROVIDER      optional: "gemini" or "openai" (default: gemini if its key exists)
//   GEMINI_MODEL     optional, default gemini-3.5-flash-lite (fast)
//   GEMINI_FALLBACK_MODEL optional, default gemini-flash-latest (used when the main model is busy)
//   OPENAI_MODEL     optional, default gpt-4o-mini
//   VERIFY_ANSWERS   optional "true"/"false" (default: on for OpenAI, off for Gemini)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_QUESTIONS = 30;
const MAX_TEXT = 60000;
const CHUNK = 6000;

// Best-effort limit per IP (resets when the function restarts)
const hits = new Map<string, { n: number; t: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 60 * 60 * 1000) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n += 1;
  return h.n > 20; // 20 quizzes per hour per IP
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function clean(s: unknown, max: number): string {
  return String(s ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, max).trim();
}

// Which AI to use: set AI_PROVIDER to "gemini" or "openai".
// If AI_PROVIDER is not set, Gemini is used when GEMINI_API_KEY exists, otherwise OpenAI.
function provider(): "gemini" | "openai" {
  const p = (Deno.env.get("AI_PROVIDER") || "").toLowerCase();
  if (p === "gemini" || p === "openai") return p;
  return Deno.env.get("GEMINI_API_KEY") ? "gemini" : "openai";
}

function friendly(status: number, body: string): Error {
  if (/quota|credit|billing|exhaust/i.test(body)) return new Error("Today's free AI limit for the app is used up. Please try again later.");
  if (status === 429) return new Error("AI is busy right now. Please try again in a minute.");
  return new Error("AI request failed. Please try again.");
}

async function callOpenAI(messages: { role: string; content: string }[], maxTokens: number) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("Server is missing OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      messages, response_format: { type: "json_object" }, temperature: 0.4, max_tokens: maxTokens,
    }),
  });
  if (!res.ok) { const t = await res.text(); console.error("OpenAI error", res.status, t.slice(0, 500)); throw friendly(res.status, t); }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "{}";
}

async function geminiOnce(model: string, key: string, system: string, user: string, maxTokens: number) {
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(40000),
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: maxTokens },
    }),
  });
}

async function callGemini(messages: { role: string; content: string }[], maxTokens: number) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("Server is missing GEMINI_API_KEY");
  const main = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
  const backup = Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-flash-latest";
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const user = messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n");
  // Try the fast main model, then the backup model if Google is overloaded or slow.
  const plan = [main, backup];
  let lastStatus = 0, lastBody = "";
  for (let i = 0; i < plan.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));
    let res: Response;
    try { res = await geminiOnce(plan[i], key, system, user, maxTokens); }
    catch (e) { console.error("Gemini timeout/network", plan[i], String(e)); lastStatus = 503; lastBody = "timeout"; continue; }
    if (res.ok) {
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
      if (text) return text;
      lastStatus = 502; lastBody = "empty response";
      continue;
    }
    lastStatus = res.status; lastBody = await res.text();
    console.error("Gemini error", plan[i], res.status, lastBody.slice(0, 300));
    const quota = res.status === 429 && /quota|exhaust/i.test(lastBody);
    // Each Gemini model has its own free quota, so a used-up main model can still fall back to the backup.
    if (quota && plan[i] === main && i < plan.length - 1) { i = plan.length - 2; continue; }
    if (res.status === 404 && i < plan.length - 1) continue; // model retired: try the backup
    const busy = res.status === 503 || res.status === 500 || (res.status === 429 && !quota);
    if (!busy) break; // bad key, bad request or every quota used up: retrying won't help
  }
  if (lastStatus === 503 || lastStatus === 500) throw new Error("AI is busy right now. Please try again in a minute.");
  throw friendly(lastStatus, lastBody);
}

async function openai(messages: { role: string; content: string }[], maxTokens = 4000): Promise<any> {
  const raw = provider() === "gemini" ? await callGemini(messages, maxTokens) : await callOpenAI(messages, maxTokens);
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

// The answer-check step doubles AI calls. It is on for OpenAI and off for Gemini
// (to save the small free quota) unless VERIFY_ANSWERS is set to "true" or "false".
function shouldVerify(): boolean {
  const v = (Deno.env.get("VERIFY_ANSWERS") || "").toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return provider() === "openai";
}

const SYSTEM = `You are an expert exam setter for students in Pakistan. You write accurate, syllabus-appropriate multiple-choice questions.
Rules: exactly 4 options; exactly one correct; believable wrong options; no "all of the above" or "none of the above";
a one-sentence explanation of why the answer is correct; never invent facts. Reply with JSON only.`;

function langLine(language: string) {
  if (language === "Urdu") return "Write questions, options and explanations in Urdu (Urdu script).";
  if (language === "Both") return "Write each question in English followed by its Urdu translation in brackets; options in English.";
  return "Write in clear, simple English.";
}

const FORMAT = `Return: {"questions":[{"q":"","options":["","","",""],"answer":0,"explanation":"","subtopic":"","difficulty":"Easy|Medium|Hard"PAGE}]} where "answer" is the 0-based index of the correct option.`;

async function fromTopic(b: any, count: number) {
  const prompt = `Exam style: ${b.examStyle} (${b.examLevel}). Subject: ${b.subject}. Topic: ${b.topic}.
Difficulty: ${b.difficulty}. Number of questions: ${count}.
${langLine(b.language)}
Follow the question style of ${b.examStyle} papers. Cover different subtopics.
${FORMAT.replace("PAGE", "")}`;
  const out = await openai([{ role: "system", content: SYSTEM }, { role: "user", content: prompt }]);
  return out.questions || [];
}

async function fromText(b: any, count: number, text: string) {
  // Gemini reads long text well, so send the PDF in one call to save quota.
  const size = provider() === "gemini" ? MAX_TEXT : CHUNK;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  const use = chunks.slice(0, Math.min(chunks.length, count));
  const per = use.map((_, i) => Math.floor(count / use.length) + (i < count % use.length ? 1 : 0));
  const results = await Promise.all(use.map((chunk, i) => openai([
    { role: "system", content: SYSTEM },
    { role: "user", content: `Below is text from a student's study material (pages ${b.pdfPages}). Page markers look like [Page N].
Write ${per[i]} MCQs using ONLY facts stated in this text. If the text has too little content, write fewer. Never invent facts.
Exam style: ${b.examStyle}. Difficulty: ${b.difficulty}. ${langLine(b.language)}
Include "page": the page number where the answer is found.
${FORMAT.replace("PAGE", ',"page":1')}

TEXT:
${chunk}` },
  ]).then((o) => o.questions || []).catch(() => [])));
  return results.flat();
}

async function verify(questions: any[]) {
  if (!questions.length) return questions;
  try {
    const out = await openai([
      { role: "system", content: "You check multiple-choice questions for correctness. Reply with JSON only." },
      { role: "user", content: `For each question, solve it yourself, then say whether the given answer index is correct and the question is clear.
Return {"results":[{"index":0,"ok":true}]}.
Questions: ${JSON.stringify(questions.map((q, i) => ({ index: i, q: q.q, options: q.options, answer: q.answer })))}` },
    ], 2000);
    const bad = new Set((out.results || []).filter((r: any) => r && r.ok === false).map((r: any) => r.index));
    return questions.filter((_, i) => !bad.has(i));
  } catch (_) {
    return questions; // if the check fails, keep the questions rather than failing the quiz
  }
}

function valid(q: any) {
  return q && typeof q.q === "string" && Array.isArray(q.options) && q.options.length === 4 &&
    q.options.every((o: unknown) => typeof o === "string") && Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) return json({ error: "Too many quizzes this hour. Please try again later." }, 429);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }

  const b = {
    examStyle: clean(body.examStyle, 30) || "General",
    examLevel: clean(body.examLevel, 30),
    subject: clean(body.subject, 60) || "General",
    topic: clean(body.topic, 300),
    difficulty: ["Easy", "Medium", "Hard", "Mixed"].includes(body.difficulty) ? body.difficulty : "Medium",
    language: ["English", "Urdu", "Both"].includes(body.language) ? body.language : "English",
    pdfPages: clean(body.pdfPages, 20),
  };
  const count = Math.max(1, Math.min(MAX_QUESTIONS, parseInt(body.count) || 10));
  const text = typeof body.pdfText === "string" ? body.pdfText.slice(0, MAX_TEXT) : "";

  if (!text && !b.topic) return json({ error: "Please give a topic or a PDF" }, 400);

  try {
    let questions = text ? await fromText(b, count, text) : await fromTopic(b, count);
    questions = questions.filter(valid).slice(0, count);
    if (shouldVerify()) questions = await verify(questions);
    if (!questions.length) return json({ error: "Could not create questions. Try a clearer topic." }, 502);
    return json({ questions });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
