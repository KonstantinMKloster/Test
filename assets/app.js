const entriesEl = document.getElementById("entries");
const emptyStateEl = document.getElementById("empty-state");
const searchEl = document.getElementById("search");
const channelFilterEl = document.getElementById("channel-filter");
const lastRunEl = document.getElementById("last-run");

let allEntries = [];

init();

async function init() {
  const [entries, lastRun] = await Promise.all([loadJson("data/summaries.json", []), loadJson("data/last_run.json", null)]);

  allEntries = entries;
  renderLastRun(lastRun);
  populateChannelFilter(entries);
  render();

  searchEl.addEventListener("input", render);
  channelFilterEl.addEventListener("change", render);
}

async function loadJson(path, fallback) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

function renderLastRun(lastRun) {
  if (!lastRun?.finishedAt) {
    lastRunEl.textContent = "Noch kein automatischer Lauf abgeschlossen.";
    return;
  }
  const date = new Date(lastRun.finishedAt);
  const formatted = date.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  const newCount = lastRun.newEntries ?? 0;
  lastRunEl.textContent = `Letzter Lauf: ${formatted} · ${newCount} neue Zusammenfassung(en)`;
}

function populateChannelFilter(entries) {
  const names = [...new Set(entries.map((e) => e.channelName))].sort();
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    channelFilterEl.appendChild(opt);
  }
}

function render() {
  const query = searchEl.value.trim().toLowerCase();
  const channel = channelFilterEl.value;

  const filtered = allEntries.filter((e) => {
    if (channel && e.channelName !== channel) return false;
    if (!query) return true;
    const haystack = `${e.title} ${(e.summaryBullets || []).join(" ")}`.toLowerCase();
    return haystack.includes(query);
  });

  emptyStateEl.hidden = allEntries.length > 0;
  entriesEl.innerHTML = "";

  if (filtered.length === 0 && allEntries.length > 0) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "Keine Treffer für diese Suche/diesen Filter.";
    entriesEl.appendChild(p);
    return;
  }

  for (const entry of filtered) {
    entriesEl.appendChild(renderCard(entry));
  }
}

function renderCard(entry) {
  const card = document.createElement("article");
  card.className = "entry-card";

  const img = document.createElement("img");
  img.src = entry.thumbnail || "";
  img.alt = "";
  img.loading = "lazy";
  card.appendChild(img);

  const body = document.createElement("div");

  const meta = document.createElement("div");
  meta.className = "entry-card__meta";
  meta.innerHTML = `
    <span class="badge">${escapeHtml(entry.channelName || "Unbekannt")}</span>
    <span>${formatDate(entry.publishedAt)}</span>
    <span>· ${entry.summaryMethod === "openai" ? "KI-Zusammenfassung" : "Automatische Zusammenfassung"}</span>
  `;
  body.appendChild(meta);

  const h2 = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.href = entry.source;
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";
  titleLink.textContent = entry.title;
  h2.appendChild(titleLink);
  body.appendChild(h2);

  const ul = document.createElement("ul");
  for (const bullet of entry.summaryBullets || []) {
    const li = document.createElement("li");
    li.textContent = bullet;
    ul.appendChild(li);
  }
  body.appendChild(ul);

  const footer = document.createElement("div");
  footer.className = "entry-card__footer";
  footer.innerHTML = `<span>${entry.hasTranscript ? "Quelle: Transkript" : "Quelle: Videobeschreibung"}</span>`;
  const sourceLink = document.createElement("a");
  sourceLink.href = entry.source;
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener noreferrer";
  sourceLink.textContent = "Video ansehen ↗";
  footer.appendChild(sourceLink);
  body.appendChild(footer);

  card.appendChild(body);
  return card;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("de-DE", { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
