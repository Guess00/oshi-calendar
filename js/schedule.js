import {
  addDaysToISO,
  formatRelativeLabel,
  getJapaneseWeekday,
  getTokyoNowParts,
} from "./clock.js";

const CATEGORY_META = {
  anime: { label: "番剧", cls: "cat-anime" },
  event: { label: "线下活动", cls: "cat-event" },
  program: { label: "节目", cls: "cat-program" },
  guest: { label: "嘉宾", cls: "cat-guest" },
  column: { label: "专栏", cls: "cat-column" },
  other: { label: "其他", cls: "cat-other" },
};

const SOURCE_LABELS = {
  anilist: "AniList",
  syoboi: "Syoboi",
  eventernote: "Eventernote",
  youtube: "YouTube",
  rule: "固定规则",
  tweet: "推特公告",
  manual: "手动添加",
};

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sortDayEvents(events) {
  return [...events].sort((a, b) => {
    const ta = a.time || "";
    const tb = b.time || "";
    if (!ta && tb) return -1;
    if (ta && !tb) return 1;
    if (ta !== tb) return ta.localeCompare(tb);
    return String(a.title || "").localeCompare(String(b.title || ""), "ja");
  });
}

export function createScheduleController({
  seiyuuList,
  events,
  windowDays = 7,
  dateStripEl,
  listEl,
  filterEl,
  todayBtn,
  modeSingleBtn,
  modeAllBtn,
}) {
  const seiyuuById = new Map(seiyuuList.map((s) => [s.id, s]));
  let todayIso = getTokyoNowParts().isoDate;
  let selectedDate = todayIso;
  let viewMode = "single"; // "single" | "all"
  let activeSeiyuuId = "all";

  const getWindowDates = () => {
    const dates = [];
    for (let d = -windowDays; d <= windowDays; d++) {
      dates.push(addDaysToISO(todayIso, d));
    }
    return dates;
  };

  const getFilteredEvents = () => {
    if (activeSeiyuuId === "all") return events;
    return events.filter((ev) => (ev.seiyuuIds || []).includes(activeSeiyuuId));
  };

  const groupByDate = (list) => {
    const map = new Map();
    for (const ev of list) {
      if (!ev.date) continue;
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date).push(ev);
    }
    for (const [k, arr] of map.entries()) {
      map.set(k, sortDayEvents(arr));
    }
    return map;
  };

  const renderSeiyuuFilters = () => {
    if (!filterEl) return;
    if (seiyuuList.length <= 1) {
      filterEl.hidden = true;
      return;
    }
    filterEl.hidden = false;
    const chips = [
      { id: "all", name: "全部" },
      ...seiyuuList.map((s) => ({ id: s.id, name: s.name })),
    ];
    filterEl.innerHTML = chips
      .map(
        (c) => `
          <button
            type="button"
            class="seiyuu-chip ${activeSeiyuuId === c.id ? "is-active" : ""}"
            data-seiyuu-id="${escapeHtml(c.id)}"
          >${escapeHtml(c.name)}</button>
        `
      )
      .join("");
  };

  const renderDateStrip = (grouped, centerSelected = false) => {
    const dates = getWindowDates();
    dateStripEl.innerHTML = dates
      .map((iso, idx) => {
        const [, mm, dd] = iso.split("-");
        const wd = getJapaneseWeekday(iso);
        const hasEvents = (grouped.get(iso) || []).length > 0;
        const showMonth = idx === 0 || dd === "01";
        const cls = [
          "date-pill",
          wd.isSat ? "is-sat" : "",
          wd.isSun ? "is-sun" : "",
          iso === todayIso ? "is-today" : "",
          iso === selectedDate ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `
          <button
            type="button"
            role="option"
            aria-selected="${iso === selectedDate}"
            class="${cls}"
            data-date="${iso}"
          >
            ${showMonth ? `<span class="pill-month">${Number(mm)}月</span>` : ""}
            <span class="pill-wd">${wd.char}</span>
            <span class="pill-day">${Number(dd)}</span>
            <span class="pill-dot ${hasEvents ? "" : "is-empty"}" aria-hidden="true"></span>
          </button>
        `;
      })
      .join("");

    if (centerSelected) {
      const selectedEl = dateStripEl.querySelector(".date-pill.is-selected");
      selectedEl?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  };

  const renderEventRow = (ev) => {
    const cat = CATEGORY_META[ev.category] || CATEGORY_META.other;
    const sourceLabel = SOURCE_LABELS[ev.source] || ev.source || "";
    const seiyuuTags = (ev.seiyuuIds || [])
      .map((id) => seiyuuById.get(id))
      .filter(Boolean)
      .map(
        (s) => `
          <span class="seiyuu-tag">
            <span class="seiyuu-dot" style="background:${escapeHtml(s.accentColor || "#ec7644")}"></span>
            ${escapeHtml(s.name)}
          </span>
        `
      )
      .join("");

    const timeHtml = ev.time
      ? `<span class="event-time">${escapeHtml(ev.time)}</span>`
      : `<span class="event-time is-allday">全天</span>`;

    const inner = `
      <div class="event-time-col">${timeHtml}</div>
      <div class="event-body">
        <div class="event-meta-row">
          <span class="cat-badge ${cat.cls}">${cat.label}</span>
          ${seiyuuTags}
          ${sourceLabel ? `<span class="source-tag">${escapeHtml(sourceLabel)}</span>` : ""}
        </div>
        <div class="event-title-row">
          <div class="event-title">${escapeHtml(ev.title)}</div>
          ${ev.url ? `<span class="ext-arrow" aria-hidden="true">↗</span>` : ""}
        </div>
        ${ev.note ? `<div class="event-note">${escapeHtml(ev.note)}</div>` : ""}
      </div>
    `;

    if (ev.url) {
      return `<a class="event-row" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    }
    return `<div class="event-row">${inner}</div>`;
  };

  const renderDayCard = (iso, dayEvents) => {
    const [, mm, dd] = iso.split("-");
    const wd = getJapaneseWeekday(iso);
    const rel = formatRelativeLabel(iso, todayIso);
    const wdCls = wd.isSat ? "day-weekday is-sat" : wd.isSun ? "day-weekday is-sun" : "day-weekday";

    return `
      <article class="day-card" data-day-card="${iso}">
        <header class="day-card-header">
          <div class="day-title-group">
            <span class="day-heading">${Number(mm)}月${Number(dd)}日（<span class="${wdCls}">${wd.char}</span>）</span>
            <span class="day-rel-tag">${rel}</span>
          </div>
          <span class="day-count">${dayEvents.length > 0 ? `${dayEvents.length} 项安排` : "暂无安排"}</span>
        </header>
        ${
          dayEvents.length > 0
            ? `<div class="event-list">${dayEvents.map(renderEventRow).join("")}</div>`
            : `<div class="day-empty">这一天目前没有已登记的番剧、活动或节目安排。</div>`
        }
      </article>
    `;
  };

  const render = ({ centerSelected = false } = {}) => {
    const grouped = groupByDate(getFilteredEvents());
    renderSeiyuuFilters();
    renderDateStrip(grouped, centerSelected);

    if (modeSingleBtn && modeAllBtn) {
      modeSingleBtn.classList.toggle("is-active", viewMode === "single");
      modeAllBtn.classList.toggle("is-active", viewMode === "all");
    }

    if (viewMode === "single") {
      listEl.innerHTML = renderDayCard(selectedDate, grouped.get(selectedDate) || []);
    } else {
      const dates = getWindowDates();
      listEl.innerHTML = dates
        .map((iso) => renderDayCard(iso, grouped.get(iso) || []))
        .join("");
    }
  };

  const selectDate = (iso, { scrollCard = false, centerPill = true } = {}) => {
    selectedDate = iso;
    render({ centerSelected: centerPill });
    if (viewMode === "all" && scrollCard) {
      const card = listEl.querySelector(`[data-day-card="${iso}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  dateStripEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".date-pill");
    if (!btn) return;
    selectDate(btn.dataset.date, { scrollCard: true, centerPill: true });
  });

  filterEl?.addEventListener("click", (e) => {
    const btn = e.target.closest(".seiyuu-chip");
    if (!btn) return;
    activeSeiyuuId = btn.dataset.seiyuuId;
    render();
  });

  todayBtn?.addEventListener("click", () => {
    todayIso = getTokyoNowParts().isoDate;
    selectDate(todayIso, { scrollCard: true, centerPill: true });
  });

  modeSingleBtn?.addEventListener("click", () => {
    if (viewMode === "single") return;
    viewMode = "single";
    render({ centerSelected: true });
  });

  modeAllBtn?.addEventListener("click", () => {
    if (viewMode === "all") return;
    viewMode = "all";
    render({ centerSelected: false });
    const card = listEl.querySelector(`[data-day-card="${selectedDate}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Mobile left/right swipe in single-day mode
  let touchStartX = null;
  let touchStartY = null;
  listEl.addEventListener(
    "touchstart",
    (e) => {
      if (viewMode !== "single" || e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );

  listEl.addEventListener(
    "touchend",
    (e) => {
      if (viewMode !== "single" || touchStartX === null || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      touchStartX = null;
      touchStartY = null;
      if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      const dates = getWindowDates();
      const curIdx = dates.indexOf(selectedDate);
      if (curIdx === -1) return;
      const nextIdx = dx < 0 ? curIdx + 1 : curIdx - 1;
      if (nextIdx >= 0 && nextIdx < dates.length) {
        selectDate(dates[nextIdx], { centerPill: true });
      }
    },
    { passive: true }
  );

  render({ centerSelected: true });

  return {
    onTokyoDateRollover(newIso) {
      const wasToday = selectedDate === todayIso;
      todayIso = newIso;
      if (wasToday) selectedDate = newIso;
      render({ centerSelected: true });
    },
  };
}
