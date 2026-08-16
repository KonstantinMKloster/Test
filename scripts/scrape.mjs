#!/usr/bin/env node
// Haupt-Job: wird alle 6 Stunden per GitHub Actions Cron ausgeführt
// (.github/workflows/scrape.yml), kann aber auch lokal per `npm run scrape`
// gestartet werden.
//
// Ablauf pro konfiguriertem Kanal (config/channels.json):
//   1. Neueste Videos über den öffentlichen RSS-Feed laden (kein API-Key).
//   2. Bereits bekannte Video-IDs überspringen (data/summaries.json).
//   3. Transkript best-effort laden, sonst RSS-Beschreibung als Fallback nutzen.
//   4. Zusammenfassung erzeugen (lokal kostenlos, optional OpenAI).
//   5. Ergebnis inkl. Quelle (Video-URL) in data/summaries.json speichern.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchChannelVideos, fetchTranscript } from "../src/lib/youtube.mjs";
import { summarize } from "../src/lib/summarize.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHANNELS_PATH = path.join(ROOT, "config", "channels.json");
const DATA_PATH = path.join(ROOT, "data", "summaries.json");
const LAST_RUN_PATH = path.join(ROOT, "data", "last_run.json");

const MAX_VIDEOS_PER_CHANNEL = 5; // wie viele der neuesten Feed-Einträge je Kanal geprüft werden
const MAX_STORED_ENTRIES = 300; // Obergrenze für data/summaries.json
const REQUEST_DELAY_MS = 1500; // Höflichkeitspause zwischen Requests an YouTube

async function main() {
  const channels = JSON.parse(await readFile(CHANNELS_PATH, "utf-8"));
  const existing = await loadExisting();
  const knownIds = new Set(existing.map((e) => e.videoId));

  const runStats = { startedAt: new Date().toISOString(), channels: [], newEntries: 0, errors: [] };
  const newEntries = [];

  for (const channel of channels) {
    const channelStat = { name: channel.name, checked: 0, new: 0, error: null };
    try {
      console.log(`\n== ${channel.name} (${channel.channelId}) ==`);
      const videos = (await fetchChannelVideos(channel.channelId)).slice(0, MAX_VIDEOS_PER_CHANNEL);
      channelStat.checked = videos.length;

      for (const video of videos) {
        if (!video.videoId || knownIds.has(video.videoId)) continue;

        console.log(`  -> neues Video: "${video.title}"`);
        const entry = await processVideo(channel, video);
        newEntries.push(entry);
        knownIds.add(video.videoId);
        channelStat.new += 1;
        await sleep(REQUEST_DELAY_MS);
      }
    } catch (err) {
      console.error(`  ! Fehler bei Kanal ${channel.name}: ${err.message}`);
      channelStat.error = err.message;
      runStats.errors.push({ channel: channel.name, error: err.message });
    }
    runStats.channels.push(channelStat);
  }

  runStats.newEntries = newEntries.length;
  runStats.finishedAt = new Date().toISOString();

  if (newEntries.length > 0) {
    const merged = [...newEntries, ...existing]
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, MAX_STORED_ENTRIES);
    await writeFile(DATA_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
    console.log(`\n${newEntries.length} neue Zusammenfassung(en) gespeichert.`);
  } else {
    console.log("\nKeine neuen Videos gefunden.");
  }

  await mkdir(path.dirname(LAST_RUN_PATH), { recursive: true });
  await writeFile(LAST_RUN_PATH, JSON.stringify(runStats, null, 2) + "\n", "utf-8");
}

async function processVideo(channel, video) {
  let transcript = null;
  let transcriptError = null;
  try {
    transcript = await fetchTranscript(video.videoId);
  } catch (err) {
    transcriptError = err.message;
  }

  const textForSummary = transcript || video.description || "";
  const { bullets, method } = await summarize(textForSummary, {
    title: video.title,
    channelName: channel.name,
  });

  return {
    videoId: video.videoId,
    channelName: channel.name,
    channelId: channel.channelId,
    title: video.title,
    source: video.url, // explizite Quellenangabe
    thumbnail: video.thumbnail,
    publishedAt: video.publishedAt,
    scrapedAt: new Date().toISOString(),
    summaryBullets: bullets,
    summaryMethod: method,
    hasTranscript: Boolean(transcript),
    transcriptError: transcript ? null : transcriptError,
  };
}

async function loadExisting() {
  try {
    const raw = await readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Fataler Fehler im Scrape-Lauf:", err);
  process.exitCode = 1;
});
