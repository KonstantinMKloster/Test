// Kostenloser YouTube-"Scraper" ohne offiziellen API-Key.
// Nutzt den öffentlichen RSS-Feed jedes Kanals für neue Videos und liest
// (best effort) das Untertitel-/Transkript-Track eines Videos von der
// öffentlichen Watch-Seite. Beides sind inoffizielle, aber weit verbreitete
// und stabile Mechanismen (kein Login, kein Quota-Limit einer API).
//
// Hinweis: Da YouTube kein offizielles Transcript-API kostenlos anbietet,
// ist dieser Teil "best effort". Schlägt er fehl (kein Transkript, Layout
// geändert etc.), fällt scrape.mjs auf die RSS-Beschreibung zurück.

import { XMLParser } from "fast-xml-parser";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
  // Umgeht in der Regel die EU-Cookie-Consent-Zwischenseite.
  Cookie: "CONSENT=YES+1;",
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

/**
 * Lädt den RSS/Atom-Feed eines Kanals und liefert eine Liste der neuesten Videos.
 * @param {string} channelId YouTube-Channel-ID (UC...)
 * @returns {Promise<Array<object>>}
 */
export async function fetchChannelVideos(channelId) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(
    channelId,
  )}`;

  const res = await fetch(feedUrl, { headers: BROWSER_HEADERS });
  if (!res.ok) {
    throw new Error(`RSS-Feed für ${channelId} fehlgeschlagen: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const parsed = xmlParser.parse(xml);

  const entries = toArray(parsed?.feed?.entry);
  return entries.map((entry) => {
    const mediaGroup = entry["media:group"] ?? {};
    const thumbnail = mediaGroup["media:thumbnail"]?.["@_url"] ?? null;
    const description = mediaGroup["media:description"] ?? "";
    const videoId = entry["yt:videoId"] ?? entry.id?.replace("yt:video:", "");

    return {
      videoId,
      title: entry.title ?? "(ohne Titel)",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt: entry.published ?? entry.updated ?? null,
      channelName: entry.author?.name ?? null,
      description: typeof description === "string" ? description : "",
      thumbnail,
    };
  });
}

/**
 * Best-effort-Versuch, das deutsche (oder erste verfügbare) Transkript eines
 * Videos zu laden. Gibt null zurück, wenn keins gefunden werden konnte.
 * @param {string} videoId
 * @returns {Promise<string|null>}
 */
export async function fetchTranscript(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=de`;
  const res = await fetch(watchUrl, { headers: BROWSER_HEADERS });
  if (!res.ok) return null;
  const html = await res.text();

  const track = extractCaptionTrack(html);
  if (!track?.baseUrl) return null;

  const transcriptRes = await fetch(track.baseUrl, { headers: BROWSER_HEADERS });
  if (!transcriptRes.ok) return null;
  const transcriptXml = await transcriptRes.text();

  const parsed = xmlParser.parse(transcriptXml);
  const lines = toArray(parsed?.transcript?.text);
  const text = lines
    .map((line) => (typeof line === "string" ? line : line["#text"] ?? ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > 0 ? text : null;
}

function extractCaptionTrack(html) {
  const match = html.match(/"captionTracks":(\[.*?\])/s);
  if (!match) return null;

  let tracks;
  try {
    tracks = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const german = tracks.find((t) => (t.languageCode ?? "").startsWith("de"));
  const chosen = german ?? tracks[0];
  return chosen ? { baseUrl: chosen.baseUrl, lang: chosen.languageCode } : null;
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
