# 更新与 GitHub Pages 使用指南

## 日常怎么更新？

1. 在 Antigravity 里打开本文件夹 `d:\nsy-helper`。
2. 在对话里直接输入：**「更新一下」**。
3. Antigravity 会自动按 `AGENTS.md` 执行：
   - 运行 `node scripts/sync-sources.mjs` 拉取番剧、Eventernote、YouTube 节目与固定周期规则；
   - 通过内置浏览器查看关注声优主页（原创 + RT）和关联节目官推，提取新日程并更新推特记录；
   - 按 `data/config.json` 中的 `pushMode` 决定先等你确认（`W1`）还是直接推送（`W2`）。

## 以后想从 W1 切到 W2 怎么办？

直接对 Antigravity 说一句：
> **「把更新模式切到 W2，以后更新完直接自动 push」**

Antigravity 会把 `data/config.json` 的 `"pushMode"` 改成 `"W2"` 并推到仓库，之后任何新对话都会自动沿用 W2（想切回 W1 同理）。

## 以后想加新声优 / 补一条冷门活动怎么办？

直接对 Antigravity 说即可，例如：
- 「加一位声优 XXX，她的固定节目有……」
- 「帮我在 12 月 3 日 20:00 JST 补一条橘杏咲的嘉宾生放送，链接是……」

## GitHub Pages 首次上线 3 步走（仅需操作一次）

1. 登录 `https://github.com/Guess00` 后，打开 `https://github.com/new`：
   - Repository name 填 **`oshi-calendar`**
   - 选择 **Public**
   - 不要勾选 Add a README / .gitignore
   - 点击 **Create repository**
2. 回到 Antigravity 告诉我「仓库建好了」，我执行首次 `git push`（若弹出 Windows GitHub 登录框，点浏览器授权一次，之后电脑会永久记住）。
3. 推完后打开 `https://github.com/Guess00/oshi-calendar/settings/pages`：
   - **Source** 选 `Deploy from a branch`
   - **Branch** 选 `main`，目录选 `/ (root)`，点 **Save**
   - 等约 1 分钟即可访问 `https://guess00.github.io/oshi-calendar/`。
