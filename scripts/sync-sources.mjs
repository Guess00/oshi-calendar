#!/usr/bin/env node
/**
 * Sync structured schedule sources for all tracked seiyuu in data/seiyuu.json:
 *   1. AniList GraphQL API (airing & upcoming anime episodes -> JST 0-24)
 *   2. Eventernote actor page (offline & public events -> JST 0-24)
 *   3. YouTube Atom RSS (show channels matching keywords -> JST 0-24)
 *   4. Recurring rules (monthly/weekly columns & shows -> JST 0-24)
 *
 * Preserves existing source="manual" and source="tweet" entries losslessly.
 * Zero external npm dependencies (uses Node.js native fetch).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SEIYUU_PATH = path.join(ROOT, "data", "seiyuu.json");
const SCHEDULE_PATH = path.join(ROOT, "data", "schedule.json");

const TOKYO_TZ = "Asia/Tokyo";
const USER_AGENT =
  "OshiCalendarBot/1.0 (+https://github.com/Guess00/oshi-calendar)";

const dtfTokyo = new Intl.DateTimeFormat("en-US", {
  timeZone: TOKYO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function toTokyoParts(date) {
  const parts = dtfTokyo.formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    date: `${m.year}-${m.month}-${m.day}`,
    time: `${m.hour}:${m.minute}`,
    iso: `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}+09:00`,
  };
}

function addDaysISO(isoDate, delta) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

function decodeHtmlEntities(str) {
  return String(str ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html) {
  return decodeHtmlEntities(String(html ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize Japanese late-night hour notation (e.g. 25:30 -> next day 01:30).
 */
function normalizeJstDateTime(isoDate, rawTime) {
  if (!rawTime) return { date: isoDate, time: null };
  const m = /(\d{1,2}):(\d{2})/.exec(rawTime);
  if (!m) return { date: isoDate, time: null };
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  let dayShift = 0;
  while (hour >= 24) {
    hour -= 24;
    dayShift += 1;
  }
  return {
    date: dayShift ? addDaysISO(isoDate, dayShift) : isoDate,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        ...(options.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* 1. AniList GraphQL: Airing & Upcoming Anime Episodes                       */
/* -------------------------------------------------------------------------- */
async function syncAniListForSeiyuu(seiyuu, minDate, maxDate) {
  const staffQuery = `
    query ($id: Int, $search: String) {
      Staff(id: $id, search: $search) {
        id
        name { full native }
        characterMedia(page: 1, perPage: 50, sort: [START_DATE_DESC]) {
          edges {
            characters {
              name { native full }
            }
            node {
              id
              type
              status
              siteUrl
              title { native romaji }
            }
          }
        }
      }
    }
  `;

  const variables = seiyuu.anilistId
    ? { id: seiyuu.anilistId }
    : { search: seiyuu.anilistSearch || seiyuu.romaji || seiyuu.name };

  const res = await fetchWithTimeout("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: staffQuery, variables }),
  });

  if (!res.ok) {
    throw new Error(`AniList HTTP ${res.status}`);
  }
  const json = await res.json();
  const staff = json?.data?.Staff;
  if (!staff) {
    throw new Error(`AniList 未找到声优: ${JSON.stringify(variables)}`);
  }

  const mediaMap = new Map();
  for (const edge of staff.characterMedia?.edges || []) {
    const media = edge?.node;
    if (!media || media.type !== "ANIME") continue;
    if (media.status !== "RELEASING" && media.status !== "NOT_YET_RELEASED") continue;
    const chars = (edge.characters || [])
      .map((c) => c?.name?.native || c?.name?.full)
      .filter(Boolean);
    const existing = mediaMap.get(media.id);
    if (existing) {
      for (const c of chars) {
        if (!existing.chars.includes(c)) existing.chars.push(c);
      }
    } else {
      mediaMap.set(media.id, {
        id: media.id,
        title: media.title?.native || media.title?.romaji || "Untitled Anime",
        siteUrl: media.siteUrl || `https://anilist.co/anime/${media.id}`,
        chars,
      });
    }
  }

  const mediaIds = Array.from(mediaMap.keys());
  const results = [];
  if (mediaIds.length > 0) {
    const minTs = Math.floor(new Date(`${minDate}T00:00:00+09:00`).getTime() / 1000);
    const maxTs = Math.floor(new Date(`${maxDate}T23:59:59+09:00`).getTime() / 1000);
    const schedQuery = `
      query ($ids: [Int], $minTs: Int, $maxTs: Int) {
        Page(page: 1, perPage: 50) {
          airingSchedules(mediaId_in: $ids, airingAt_greater: $minTs, airingAt_lesser: $maxTs, sort: TIME) {
            mediaId
            episode
            airingAt
          }
        }
      }
    `;
    const r2 = await fetchWithTimeout("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: schedQuery, variables: { ids: mediaIds, minTs, maxTs } }),
    });
    if (!r2.ok) {
      throw new Error(`AniList AiringSchedules HTTP ${r2.status}`);
    }
    const j2 = await r2.json();
    for (const ep of j2?.data?.Page?.airingSchedules || []) {
      const info = mediaMap.get(ep.mediaId);
      if (!info || !ep.airingAt) continue;
      const jst = toTokyoParts(new Date(ep.airingAt * 1000));
      if (jst.date < minDate || jst.date > maxDate) continue;
      results.push({
        id: `anilist:${seiyuu.id}:${ep.mediaId}:ep${ep.episode}`,
        seiyuuIds: [seiyuu.id],
        date: jst.date,
        time: jst.time,
        title: `${info.title} 第${ep.episode}話`,
        category: "anime",
        source: "anilist",
        note: info.chars.length ? `CV: ${info.chars.join(" / ")}` : "TVアニメ放送・配信",
        url: info.siteUrl,
      });
    }
  }

  return { resolvedId: staff.id, staffName: staff.name?.native || staff.name?.full, events: results };
}

/* -------------------------------------------------------------------------- */
/* 2. Eventernote: Offline / Public Events                                    */
/* -------------------------------------------------------------------------- */
async function resolveEventernoteId(name) {
  const res = await fetchWithTimeout(
    `https://www.eventernote.com/actors/search?keyword=${encodeURIComponent(name)}`,
    { headers: { Accept: "text/html,application/xhtml+xml" } }
  );
  if (!res.ok) throw new Error(`Eventernote search HTTP ${res.status}`);
  const html = await res.text();
  const encoded = encodeURIComponent(name);
  const re = new RegExp(`href="/actors/(?:${encoded}|${name})/(\\d+)"`, "i");
  const m = re.exec(html);
  if (!m) throw new Error(`Eventernote 未找到声优: ${name}`);
  return m[1];
}

async function syncEventernoteForSeiyuu(seiyuu, minDate, maxDate) {
  let actorId = seiyuu.eventernoteId;
  let resolvedId = null;
  const actorName = seiyuu.eventernoteName || seiyuu.name;
  if (!actorId && actorName) {
    actorId = await resolveEventernoteId(actorName);
    resolvedId = actorId;
  }
  if (!actorId) return { events: [], resolvedId: null };

  const encodedName = encodeURIComponent(actorName);
  const url = `https://www.eventernote.com/actors/${encodedName}/${actorId}/events?limit=40`;

  const res = await fetchWithTimeout(url, {
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!res.ok) {
    throw new Error(`Eventernote HTTP ${res.status}`);
  }
  const html = await res.text();

  const events = [];
  const liRegex = /<li[^>]*class="[^"]*clearfix[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRegex.exec(html)) !== null) {
    const block = match[1];
    const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(block);
    const linkMatch = /<h4[^>]*>\s*<a[^>]*href="(\/events\/(\d+))"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!dateMatch || !linkMatch) continue;

    const rawDate = dateMatch[1];
    const eventPath = linkMatch[1];
    const eventId = linkMatch[2];
    const title = stripTags(linkMatch[3]);

    const startMatch = /開演\s*(\d{1,2}:\d{2})/.exec(block);
    const openMatch = /開場\s*(\d{1,2}:\d{2})/.exec(block);
    const endMatch = /終演\s*(\d{1,2}:\d{2})/.exec(block);
    const rawTime = startMatch?.[1] || openMatch?.[1] || null;

    const venueMatch = /会場:\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    const venue = venueMatch ? stripTags(venueMatch[1]) : "";

    const norm = normalizeJstDateTime(rawDate, rawTime);
    if (norm.date < minDate || norm.date > maxDate) continue;

    const timeBits = [];
    if (openMatch) timeBits.push(`開場 ${openMatch[1]}`);
    if (startMatch) timeBits.push(`開演 ${startMatch[1]}`);
    if (endMatch) timeBits.push(`終演 ${endMatch[1]}`);

    const noteParts = [];
    if (timeBits.length) noteParts.push(timeBits.join(" / "));
    if (venue) noteParts.push(venue);

    events.push({
      id: `eventernote:${seiyuu.id}:${eventId}`,
      seiyuuIds: [seiyuu.id],
      date: norm.date,
      time: norm.time,
      title,
      category: "event",
      source: "eventernote",
      note: noteParts.join(" · "),
      url: `https://www.eventernote.com${eventPath}`,
    });
  }

  return { events, resolvedId };
}

/* -------------------------------------------------------------------------- */
/* 3. YouTube Atom RSS: Regular / Irregular Web Programs                      */
/* -------------------------------------------------------------------------- */
async function resolveYouTubeChannelId(handle) {
  const cleanHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const res = await fetchWithTimeout(`https://www.youtube.com/${cleanHandle}`, {
    headers: { "Accept-Language": "ja,en;q=0.8" },
  });
  if (!res.ok) throw new Error(`YouTube handle HTTP ${res.status}`);
  const html = await res.text();
  const m =
    /"externalId":"(UC[a-zA-Z0-9_-]{20,})"/.exec(html) ||
    /https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})/.exec(html);
  if (!m) throw new Error(`未能从 ${cleanHandle} 解析 channelId`);
  return m[1];
}

async function syncYouTubeForSeiyuu(seiyuu, minDate, maxDate) {
  const channels = seiyuu.youtubeChannels || [];
  const allEvents = [];
  const resolvedChannels = {};

  for (const ch of channels) {
    let channelId = ch.channelId;
    if (!channelId && ch.handle) {
      channelId = await resolveYouTubeChannelId(ch.handle);
      resolvedChannels[ch.handle] = channelId;
    }
    if (!channelId) continue;

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const res = await fetchWithTimeout(feedUrl);
    if (!res.ok) throw new Error(`YouTube RSS HTTP ${res.status}`);
    const xml = await res.text();

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let m;
    while ((m = entryRegex.exec(xml)) !== null) {
      const entry = m[1];
      const videoId = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry)?.[1]?.trim();
      const title = decodeHtmlEntities(/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1]?.trim() || "");
      const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1]?.trim();
      const link =
        /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/.exec(entry)?.[1] ||
        (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");

      if (!videoId || !published) continue;
      const keywords = ch.keywords || [];
      if (keywords.length > 0 && !keywords.some((kw) => title.includes(kw))) {
        continue;
      }

      const jst = toTokyoParts(new Date(published));
      if (jst.date < minDate || jst.date > maxDate) continue;

      allEvents.push({
        id: `youtube:${seiyuu.id}:${videoId}`,
        seiyuuIds: [seiyuu.id],
        date: jst.date,
        time: jst.time,
        title,
        category: ch.category || "program",
        source: "youtube",
        note: `${ch.name}${ch.label ? ` · ${ch.label}` : ""}`,
        url: link,
      });
    }
  }

  return { events: allEvents, resolvedChannels };
}

/* -------------------------------------------------------------------------- */
/* 4. Recurring Rules Generator (Monthly / Weekly)                            */
/* -------------------------------------------------------------------------- */
function generateRecurringForSeiyuu(seiyuu, minDate, maxDate) {
  const rules = seiyuu.recurringRules || [];
  const events = [];

  for (const rule of rules) {
    let cursor = minDate;
    while (cursor <= maxDate) {
      const [y, m, d] = cursor.split("-").map(Number);
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat

      let matched = false;
      if (rule.type === "monthly" && d === Number(rule.dayOfMonth)) {
        matched = true;
      } else if (rule.type === "weekly" && weekday === Number(rule.weekday)) {
        matched = true;
      }

      if (matched) {
        const norm = normalizeJstDateTime(cursor, rule.time || null);
        events.push({
          id: `rule:${seiyuu.id}:${rule.id}:${norm.date}`,
          seiyuuIds: [seiyuu.id],
          date: norm.date,
          time: norm.time,
          title: rule.title,
          category: rule.category || "other",
          source: "rule",
          note: rule.note || "",
          url: rule.url || "",
        });
      }

      cursor = addDaysISO(cursor, 1);
    }
  }

  return events;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */
async function main() {
  const seiyuuData = JSON.parse(await fs.readFile(SEIYUU_PATH, "utf8"));
  let existingSchedule = { updatedAt: null, events: [] };
  try {
    existingSchedule = JSON.parse(await fs.readFile(SCHEDULE_PATH, "utf8"));
  } catch {
    // First run
  }

  const nowJst = toTokyoParts(new Date());
  const minDate = addDaysISO(nowJst.date, -14);
  const maxDate = addDaysISO(nowJst.date, 60);
  const keepHistoryAfter = addDaysISO(nowJst.date, -45);

  console.log(`[sync] Tokyo now: ${nowJst.iso} | Window: ${minDate} .. ${maxDate}`);

  const succeededSources = new Set(["rule"]);
  const freshAutoEvents = [];
  let seiyuuJsonDirty = false;

  for (const seiyuu of seiyuuData.seiyuu || []) {
    console.log(`\n=== ${seiyuu.name} (${seiyuu.id}) ===`);

    // Recurring rules (always succeeds)
    const ruleEvents = generateRecurringForSeiyuu(seiyuu, minDate, maxDate);
    freshAutoEvents.push(...ruleEvents);
    console.log(`  [rule] ${ruleEvents.length} items`);

    // AniList
    try {
      const anilist = await syncAniListForSeiyuu(seiyuu, minDate, maxDate);
      succeededSources.add(`anilist:${seiyuu.id}`);
      freshAutoEvents.push(...anilist.events);
      if (!seiyuu.anilistId && anilist.resolvedId) {
        seiyuu.anilistId = anilist.resolvedId;
        seiyuuJsonDirty = true;
      }
      console.log(`  [anilist] id=${anilist.resolvedId} (${anilist.staffName}) -> ${anilist.events.length} items`);
    } catch (err) {
      console.warn(`  [anilist] FAILED (保留旧缓存): ${err.message}`);
    }

    // Eventernote
    try {
      const ev = await syncEventernoteForSeiyuu(seiyuu, minDate, maxDate);
      succeededSources.add(`eventernote:${seiyuu.id}`);
      freshAutoEvents.push(...ev.events);
      if (!seiyuu.eventernoteId && ev.resolvedId) {
        seiyuu.eventernoteId = ev.resolvedId;
        seiyuuJsonDirty = true;
      }
      console.log(`  [eventernote] ${ev.events.length} items`);
    } catch (err) {
      console.warn(`  [eventernote] FAILED (保留旧缓存): ${err.message}`);
    }

    // YouTube RSS
    try {
      const yt = await syncYouTubeForSeiyuu(seiyuu, minDate, maxDate);
      succeededSources.add(`youtube:${seiyuu.id}`);
      freshAutoEvents.push(...yt.events);
      for (const ch of seiyuu.youtubeChannels || []) {
        if (!ch.channelId && ch.handle && yt.resolvedChannels[ch.handle]) {
          ch.channelId = yt.resolvedChannels[ch.handle];
          seiyuuJsonDirty = true;
        }
      }
      console.log(`  [youtube] ${yt.events.length} items`);
    } catch (err) {
      console.warn(`  [youtube] FAILED (保留旧缓存): ${err.message}`);
    }
  }

  // Merge: keep manual & tweet entries, plus cached auto entries whose source failed this run
  const preservedEvents = (existingSchedule.events || []).filter((ev) => {
    if (ev.date && ev.date < keepHistoryAfter) return false;
    if (ev.source === "manual" || ev.source === "tweet") return true;
    if (ev.source === "rule") return false;
    const ownerId = ev.seiyuuIds?.[0];
    const sourceKey = `${ev.source}:${ownerId}`;
    return !succeededSources.has(sourceKey);
  });

  // Deduplicate by id (preferring freshAutoEvents for auto sources, preserving manual/tweet)
  const mergedMap = new Map();
  for (const ev of preservedEvents) mergedMap.set(ev.id, ev);
  for (const ev of freshAutoEvents) mergedMap.set(ev.id, ev);

  const mergedEvents = Array.from(mergedMap.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const ta = a.time || "";
    const tb = b.time || "";
    if (!ta && tb) return -1;
    if (ta && !tb) return 1;
    if (ta !== tb) return ta.localeCompare(tb);
    return String(a.title || "").localeCompare(String(b.title || ""), "ja");
  });

  await fs.writeFile(
    SCHEDULE_PATH,
    `${JSON.stringify({ updatedAt: nowJst.iso, events: mergedEvents }, null, 2)}\n`,
    "utf8"
  );

  if (seiyuuJsonDirty) {
    await fs.writeFile(SEIYUU_PATH, `${JSON.stringify(seiyuuData, null, 2)}\n`, "utf8");
    console.log("\n[sync] Updated cached IDs in data/seiyuu.json");
  }

  console.log(`\n[sync] Done! Total events in data/schedule.json: ${mergedEvents.length}`);
}

main().catch((err) => {
  console.error("[sync] Fatal error:", err);
  process.exit(1);
});
