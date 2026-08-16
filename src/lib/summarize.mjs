// Zusammenfassung eines Transkripts/Texts.
// Standard (immer verfügbar, kostenlos, kein API-Key): lokale, extraktive
// Zusammenfassung per Häufigkeits-Scoring der Sätze.
// Optional (bessere Qualität): OpenAI Chat Completions, falls
// process.env.OPENAI_API_KEY gesetzt ist.

import { GERMAN_STOPWORDS } from "./stopwords.de.mjs";

const MAX_BULLETS = 5;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_INPUT_CHAR_LIMIT = 15000;

/**
 * @param {string} text Transkript oder Videobeschreibung
 * @param {{ title?: string, channelName?: string }} meta
 * @returns {Promise<{ bullets: string[], method: "openai" | "lokal-extraktiv" }>}
 */
export async function summarize(text, meta = {}) {
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return { bullets: ["Kein Text (Transkript/Beschreibung) verfügbar."], method: "lokal-extraktiv" };
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const bullets = await summarizeWithOpenAI(cleaned, meta);
      if (bullets?.length) return { bullets, method: "openai" };
    } catch (err) {
      console.warn(`  ! OpenAI-Zusammenfassung fehlgeschlagen, nutze lokalen Fallback: ${err.message}`);
    }
  }

  return { bullets: summarizeLocally(cleaned), method: "lokal-extraktiv" };
}

/** Kostenlose, lokale extraktive Zusammenfassung (kein Netzwerk, kein API-Key). */
function summarizeLocally(text) {
  const sentences = splitIntoSentences(text);
  if (sentences.length <= MAX_BULLETS) {
    return sentences.length ? sentences : [text.slice(0, 400)];
  }

  const wordFreq = buildWordFrequency(text);
  const scored = sentences.map((sentence, index) => ({
    sentence,
    index,
    score: scoreSentence(sentence, wordFreq),
  }));

  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, MAX_BULLETS);
  // In ursprünglicher Reihenfolge zurückgeben, damit die Zusammenfassung
  // dem Erzählfluss des Videos folgt.
  top.sort((a, b) => a.index - b.index);
  return top.map((s) => s.sentence);
}

function splitIntoSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 400);
}

function buildWordFrequency(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !GERMAN_STOPWORDS.has(w));

  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return freq;
}

function scoreSentence(sentence, wordFreq) {
  const words = sentence
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 0;

  const total = words.reduce((sum, w) => sum + (wordFreq.get(w) ?? 0), 0);
  return total / Math.sqrt(words.length);
}

async function summarizeWithOpenAI(text, meta) {
  const truncated = text.slice(0, OPENAI_INPUT_CHAR_LIMIT);
  const system =
    "Du bist ein neutraler politischer Nachrichten-Redakteur. Du fasst YouTube-Video-Transkripte " +
    "sachlich, neutral und ohne eigene Wertung in maximal 5 prägnanten deutschen Stichpunkten zusammen. " +
    "Gib ausschließlich die Stichpunkte zurück, jeweils auf einer eigenen Zeile beginnend mit '- '. " +
    "Keine Einleitung, kein Fazit, keine Meta-Kommentare.";
  const user = `Kanal: ${meta.channelName ?? "unbekannt"}\nTitel: ${meta.title ?? "unbekannt"}\n\nTranskript:\n${truncated}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const bullets = content
    .split("\n")
    .map((line) => line.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean);

  return bullets.slice(0, MAX_BULLETS);
}
