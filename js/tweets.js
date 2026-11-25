import { formatDisplayDateTime, formatUpdatedAtJst } from "./clock.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBadgeCount(n) {
  const count = Number(n) || 0;
  if (count <= 0) return "";
  return count > 99 ? "99+" : String(count);
}

export function createTweetsController({
  seiyuuList,
  tweetsData,
  railEl,
  bannerEl,
  feedEl,
}) {
  // Strictly preserve fixed order from data/seiyuu.json (never re-sort by update count)
  const tweetAccounts = seiyuuList.filter((s) => s.showInTweetTab !== false && s.xHandle);
  let activeId = tweetAccounts[0]?.id || null;

  const updatePointerPosition = () => {
    const pointerEl = bannerEl.querySelector(".account-banner-pointer");
    const activeEl = railEl.querySelector(`.avatar-item[data-account-id="${CSS.escape(activeId || "")}"]`);
    if (!pointerEl || !activeEl || bannerEl.hidden) return;

    const bannerRect = bannerEl.getBoundingClientRect();
    const avatarRect = activeEl.getBoundingClientRect();
    if (bannerRect.width === 0 || avatarRect.width === 0) return;

    const targetCenter = avatarRect.left + avatarRect.width / 2 - bannerRect.left;
    const minX = 18;
    const maxX = bannerRect.width - 18;

    if (targetCenter < 6 || targetCenter > bannerRect.width - 6) {
      pointerEl.classList.add("is-hidden");
      return;
    }

    pointerEl.classList.remove("is-hidden");
    const clampedX = Math.max(minX, Math.min(maxX, targetCenter));
    bannerEl.style.setProperty("--pointer-x", `${clampedX.toFixed(1)}px`);
  };

  const renderRail = () => {
    if (tweetAccounts.length === 0) {
      railEl.innerHTML = "";
      return;
    }
    railEl.innerHTML = tweetAccounts
      .map((s) => {
        const isActive = s.id === activeId;
        const bucket = tweetsData?.accounts?.[s.id] || {};
        const badgeText = formatBadgeCount(bucket.newCount);
        return `
          <button
            type="button"
            role="tab"
            aria-selected="${isActive}"
            class="avatar-item ${isActive ? "is-active" : ""}"
            data-account-id="${escapeHtml(s.id)}"
          >
            <span class="avatar-ring-wrap">
              <span class="avatar-ring">
                <span class="avatar-inner">
                  <img class="avatar-img" src="${escapeHtml(s.avatar)}" alt="${escapeHtml(s.name)}" loading="lazy" />
                </span>
              </span>
              ${
                badgeText
                  ? `<span class="avatar-badge" aria-label="本次新增 ${escapeHtml(badgeText)} 条">${escapeHtml(badgeText)}</span>`
                  : ""
              }
            </span>
            <span class="avatar-name">${escapeHtml(s.name)}</span>
            <span class="avatar-handle">@${escapeHtml(s.xHandle)}</span>
          </button>
        `;
      })
      .join("");
  };

  const renderFeed = () => {
    const seiyuu = tweetAccounts.find((s) => s.id === activeId);
    if (!seiyuu) {
      bannerEl.hidden = true;
      feedEl.innerHTML = `<div class="empty-state">尚未配置关注账号。</div>`;
      return;
    }

    const bucket = tweetsData?.accounts?.[seiyuu.id] || {};
    const items = Array.isArray(bucket.items) ? bucket.items : [];
    const profileUrl = bucket.profileUrl || seiyuu.xUrl || `https://x.com/${seiyuu.xHandle}`;
    const mergedHandles = Array.isArray(seiyuu.mergedXHandles) ? seiyuu.mergedXHandles : [];
    const hasMerged = mergedHandles.length > 0;
    const checkedLabel = bucket.lastCheckedAt
      ? `巡检于 ${formatUpdatedAtJst(bucket.lastCheckedAt)}`
      : "尚未巡检";

    const titleHandles = hasMerged
      ? `@${seiyuu.xHandle} + ${mergedHandles.map((m) => `@${m.handle}`).join(" + ")}`
      : `@${seiyuu.xHandle}`;

    const linksHtml = hasMerged
      ? `
        <div class="account-banner-links">
          <a class="profile-link-btn" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">本人 ↗</a>
          ${mergedHandles
            .map(
              (m) =>
                `<a class="profile-link-btn is-secondary" href="${escapeHtml(m.url || `https://x.com/${m.handle}`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.badge || "Staff")} ↗</a>`
            )
            .join("")}
        </div>
      `
      : `<a class="profile-link-btn" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">X 主页 ↗</a>`;

    bannerEl.hidden = false;
    bannerEl.innerHTML = `
      <span class="account-banner-pointer" aria-hidden="true"></span>
      <div class="account-banner-left">
        <div class="account-banner-title">${escapeHtml(seiyuu.name)} · ${escapeHtml(titleHandles)}</div>
        <div class="account-banner-sub">共 ${items.length} 条 · ${escapeHtml(checkedLabel)}</div>
      </div>
      ${linksHtml}
    `;

    requestAnimationFrame(updatePointerPosition);

    if (items.length === 0) {
      feedEl.innerHTML = `
        <div class="empty-state">
          暂无 ${escapeHtml(seiyuu.name)}（@${escapeHtml(seiyuu.xHandle)}）的推特更新记录。<br />
          打开 Antigravity 说一句「更新一下」即可同步最新主页记录。
        </div>
      `;
      return;
    }

    // Preserve exact array order from tweets.json (mirrors X profile order / merged newest-first order)
    feedEl.innerHTML = items
      .map((item) => {
        const isRt = item.type === "rt";
        const typeLabel = isRt ? "转推 RT" : "发推";
        const typeClass = isRt ? "is-rt" : "is-original";
        const formattedTime = formatDisplayDateTime(item.postedAtJst);

        const isStaff = item.accountRole === "staff";
        const mergedMeta = isStaff
          ? mergedHandles.find((m) => m.handle === item.accountHandle) || mergedHandles[0]
          : null;

        const sourceBadgeHtml = hasMerged
          ? isStaff
            ? `<span class="tweet-source is-staff">${escapeHtml(item.accountBadge || mergedMeta?.badge || "Staff")}</span>`
            : `<span class="tweet-source is-self">本人</span>`
          : "";

        let timeLine = "时间待补全";
        if (isRt) {
          timeLine = formattedTime
            ? `原推 ${formattedTime} JST`
            : "转推（按主页顺序排列）";
        } else if (formattedTime) {
          timeLine =
            item.timePrecision === "approx"
              ? `约 ${formattedTime} JST`
              : `${formattedTime} JST`;
        } else if (item.approxTimeLabel) {
          timeLine = `${item.approxTimeLabel}（大致时间）`;
        }

        const actorLabel = isStaff
          ? `${mergedMeta?.label || `${seiyuu.name} Staff`}（@${item.accountHandle || mergedMeta?.handle || "staff"}）`
          : seiyuu.name;

        const descLine = isRt
          ? item.originalAuthor
            ? `${actorLabel} 转推了 @${item.originalAuthor} 的一条推特`
            : `${actorLabel} 转推了一条推特`
          : `${actorLabel} 更新了一条推特`;

        return `
          <a class="tweet-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <div class="tweet-card-main">
              <div class="tweet-badges">
                ${sourceBadgeHtml}
                <span class="tweet-type ${typeClass}">${typeLabel}</span>
                ${item.pinned ? `<span class="tweet-pin">置顶</span>` : ""}
              </div>
              <div class="tweet-time-line">${escapeHtml(timeLine)}</div>
              <div class="tweet-desc-line">${escapeHtml(descLine)}</div>
            </div>
            <span class="tweet-open-icon" aria-hidden="true">↗</span>
          </a>
        `;
      })
      .join("");
  };

  railEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".avatar-item");
    if (!btn) return;
    activeId = btn.dataset.accountId;
    renderRail();
    renderFeed();
    const newActive = railEl.querySelector(`.avatar-item[data-account-id="${CSS.escape(activeId)}"]`);
    newActive?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  });

  // Track pointer position when user horizontally scrolls the INS avatar rail
  railEl.addEventListener(
    "scroll",
    () => {
      requestAnimationFrame(updatePointerPosition);
    },
    { passive: true }
  );

  // Desktop convenience: vertical mouse wheel scrolls avatar rail horizontally when overflowing
  railEl.addEventListener(
    "wheel",
    (e) => {
      if (railEl.scrollWidth <= railEl.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        railEl.scrollLeft += e.deltaY;
      }
    },
    { passive: false }
  );

  window.addEventListener("resize", () => {
    requestAnimationFrame(updatePointerPosition);
  });

  renderRail();
  renderFeed();

  return {
    onTabActivated() {
      requestAnimationFrame(updatePointerPosition);
    },
  };
}
