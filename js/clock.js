const TOKYO_TZ = "Asia/Tokyo";
const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

const dtfParts = new Intl.DateTimeFormat("en-US", {
  timeZone: TOKYO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function getTokyoNowParts(now = new Date()) {
  const raw = dtfParts.formatToParts(now);
  const map = Object.fromEntries(raw.map((p) => [p.type, p.value]));
  const isoDate = `${map.year}-${map.month}-${map.day}`;
  const weekday = getJapaneseWeekday(isoDate);
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
    isoDate,
    timeStr: `${map.hour}:${map.minute}:${map.second}`,
    weekday,
  };
}

export function getJapaneseWeekday(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return {
    index: utcDay,
    char: WEEKDAYS_JA[utcDay],
    isSat: utcDay === 6,
    isSun: utcDay === 0,
  };
}

export function addDaysToISO(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function diffDaysISO(isoA, isoB) {
  const [ya, ma, da] = isoA.split("-").map(Number);
  const [yb, mb, db] = isoB.split("-").map(Number);
  const a = Date.UTC(ya, ma - 1, da);
  const b = Date.UTC(yb, mb - 1, db);
  return Math.round((a - b) / 86400000);
}

export function formatRelativeLabel(targetIso, todayIso) {
  const diff = diffDaysISO(targetIso, todayIso);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff === -1) return "昨天";
  if (diff === -2) return "前天";
  if (diff > 0) return `${diff}天后`;
  return `${Math.abs(diff)}天前`;
}

export function formatUpdatedAtJst(isoString) {
  if (!isoString) return "尚未更新";
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return String(isoString);
  const parts = getTokyoNowParts(dt);
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute} JST`;
}

export function formatDisplayDateTime(str) {
  if (!str) return null;
  // Accepts "YYYY-MM-DD HH:mm" or ISO string
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(str);
  if (m) {
    return `${m[1]}年${m[2]}月${m[3]}日 ${m[4]}:${m[5]}`;
  }
  const dt = new Date(str);
  if (!Number.isNaN(dt.getTime())) {
    const p = getTokyoNowParts(dt);
    return `${p.year}年${p.month}月${p.day}日 ${p.hour}:${p.minute}`;
  }
  return str;
}

export function startTokyoClock({ timeEl, dateEl, onDateChange }) {
  let lastDate = null;

  const tick = () => {
    const p = getTokyoNowParts();
    if (timeEl) timeEl.textContent = p.timeStr;
    if (dateEl) {
      const wdClass = p.weekday.isSat
        ? "day-weekday is-sat"
        : p.weekday.isSun
          ? "day-weekday is-sun"
          : "day-weekday";
      dateEl.innerHTML = `${p.year}年${p.month}月${p.day}日（<span class="${wdClass}">${p.weekday.char}</span>）`;
    }
    if (lastDate && lastDate !== p.isoDate && typeof onDateChange === "function") {
      onDateChange(p.isoDate);
    }
    lastDate = p.isoDate;
  };

  tick();
  return window.setInterval(tick, 1000);
}
