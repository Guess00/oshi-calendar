import { formatDisplayDateTime, formatUpdatedAtJst } from "./clock.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createTweetsController({
  seiyuuList,
  tweetsData,
  railEl,
  bannerEl,
  feedEl,
}) {
  const tweetAccounts = seiyuuList.filter((s) => s.showInTweetTab !== false && s.xHandle);
  let activeId = tweetAccounts[0]?.id || null;

  const renderRail = () => {
    if (tweetAccounts.length === 0) {
      railEl.innerHTML = "";
      return;
    }
    railEl.innerHTML = tweetAccounts
      .map((s) => {
        const isActive = s.id === activeId;
        return `
          <button
            type="button"
            role="tab"
            aria-selected="${isActive}"
            class="avatar-item ${isActive ? "is-active" : ""}"
            data-account-id="${escapeHtml(s.id)}"
          >
            <span class="avatar-ring">
              <span class="avatar-inner">
                <img class="avatar-img" src="${escapeHtml(s.avatar)}" alt="${escapeHtml(s.name)}" loading="lazy" />
              </span>
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
    const checkedLabel = bucket.lastCheckedAt
      ? `巡检于 ${formatUpdatedAtJst(bucket.lastCheckedAt)}`
      : "尚未巡检";

    bannerEl.hidden = false;
    bannerEl.innerHTML = `
      <div class="account-banner-left">
        <div class="account-banner-title">${escapeHtml(seiyuu.name)} · @${escapeHtml(seiyuu.xHandle)}</div>
        <div class="account-banner-sub">按 X 主页从上到下顺序（原创 + RT） · 共 ${items.length} 条 · ${escapeHtml(checkedLabel)}</div>
      </div>
      <a class="profile-link-btn" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">X 主页 ↗</a>
    `;

    if (items.length === 0) {
      feedEl.innerHTML = `
        <div class="empty-state">
          暂无 ${escapeHtml(seiyuu.name)}（@${escapeHtml(seiyuu.xHandle)}）的推特更新记录。<br />
          打开 Antigravity 说一句「更新一下」即可同步最新主页记录。
        </div>
      `;
      return;
    }

    // Preserve exact array order from tweets.json (mirrors X profile order, latest at top)
    feedEl.innerHTML = items
      .map((item) => {
        const isRt = item.type === "rt";
        const typeLabel = isRt ? "转推 RT" : "发推";
        const typeClass = isRt ? "is-rt" : "is-original";
        const formattedTime = formatDisplayDateTime(item.postedAtJst);

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

        const descLine = isRt
          ? item.originalAuthor
            ? `${seiyuu.name} 转推了 @${item.originalAuthor} 的一条推特`
            : `${seiyuu.name} 转推了一条推特`
          : `${seiyuu.name} 更新了一条推特`;

        return `
          <a class="tweet-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <div class="tweet-card-main">
              <div class="tweet-badges">
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
  });

  renderRail();
  renderFeed();
}
