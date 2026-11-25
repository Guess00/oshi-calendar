import { formatUpdatedAtJst, startTokyoClock } from "./clock.js";
import { createScheduleController } from "./schedule.js";
import { createTweetsController } from "./tweets.js";

async function fetchJson(path) {
  const res = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`加载 ${path} 失败 (${res.status})`);
  }
  return res.json();
}

function initTheme() {
  const toggleBtn = document.getElementById("theme-toggle");
  const iconEl = document.getElementById("theme-icon");
  const saved = localStorage.getItem("oshi-theme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  let current = saved || (prefersDark ? "dark" : "light");

  const apply = (mode) => {
    current = mode;
    document.documentElement.setAttribute("data-theme", mode);
    if (iconEl) iconEl.textContent = mode === "dark" ? "☀️" : "🌙";
  };

  apply(current);

  toggleBtn?.addEventListener("click", () => {
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("oshi-theme", next);
    apply(next);
  });
}

function initTabs() {
  const tabBtns = Array.from(document.querySelectorAll(".tab-btn"));
  const panels = {
    schedule: document.getElementById("view-schedule"),
    tweets: document.getElementById("view-tweets"),
  };

  const setActive = (tabName) => {
    for (const btn of tabBtns) {
      const active = btn.dataset.tab === tabName;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    }
    for (const [name, panel] of Object.entries(panels)) {
      if (!panel) continue;
      const active = name === tabName;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    }
    history.replaceState(null, "", `#${tabName}`);
  };

  for (const btn of tabBtns) {
    btn.addEventListener("click", () => setActive(btn.dataset.tab));
  }

  const initialHash = location.hash.replace("#", "");
  if (initialHash === "tweets" || initialHash === "schedule") {
    setActive(initialHash);
  }
}

async function bootstrap() {
  initTheme();
  initTabs();

  const timeEl = document.getElementById("jst-time");
  const dateEl = document.getElementById("jst-date");
  const updatedEl = document.getElementById("updated-at");
  const siteTitleEl = document.getElementById("site-title");

  let scheduleCtrl = null;
  startTokyoClock({
    timeEl,
    dateEl,
    onDateChange: (newIso) => scheduleCtrl?.onTokyoDateRollover(newIso),
  });

  try {
    const [config, seiyuuData, scheduleData, tweetsData] = await Promise.all([
      fetchJson("data/config.json"),
      fetchJson("data/seiyuu.json"),
      fetchJson("data/schedule.json"),
      fetchJson("data/tweets.json"),
    ]);

    if (config.siteTitle && siteTitleEl) {
      siteTitleEl.textContent = config.siteTitle;
      document.title = `${config.siteTitle} · ${config.siteSubtitle || ""}`;
    }

    const latestUpdated = [scheduleData.updatedAt, tweetsData.updatedAt]
      .filter(Boolean)
      .sort()
      .at(-1);
    if (updatedEl) {
      updatedEl.textContent = `数据更新于 ${formatUpdatedAtJst(latestUpdated)}`;
    }

    const seiyuuList = Array.isArray(seiyuuData.seiyuu) ? seiyuuData.seiyuu : [];

    scheduleCtrl = createScheduleController({
      seiyuuList,
      events: Array.isArray(scheduleData.events) ? scheduleData.events : [],
      windowDays: Number(config.scheduleWindowDays) || 7,
      dateStripEl: document.getElementById("date-strip"),
      listEl: document.getElementById("schedule-list"),
      filterEl: document.getElementById("schedule-seiyuu-filter"),
      todayBtn: document.getElementById("btn-today"),
      modeSingleBtn: document.getElementById("mode-single"),
      modeAllBtn: document.getElementById("mode-all"),
    });

    createTweetsController({
      seiyuuList,
      tweetsData,
      railEl: document.getElementById("tweet-avatar-rail"),
      bannerEl: document.getElementById("tweet-account-header"),
      feedEl: document.getElementById("tweet-feed"),
    });
  } catch (err) {
    console.error(err);
    const listEl = document.getElementById("schedule-list");
    if (listEl) {
      listEl.innerHTML = `<div class="empty-state">数据加载失败：${err.message}<br />请确认通过 HTTP 服务或 GitHub Pages 访问。</div>`;
    }
  }
}

bootstrap();
