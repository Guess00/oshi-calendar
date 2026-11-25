# oshi-calendar (d:\nsy-helper) 工作区协作与更新指令

本项目是单人定制的日本女声优行程与推特更新记录纯静态站点，托管在 GitHub Pages（`https://guess00.github.io/oshi-calendar/`）。

## 一、当用户说「更新一下」「更新日程」「更新」时的标准流程

每次用户在本工作区触发更新，严格按以下步骤执行：

1. **读取配置**：先读取 `data/config.json` 与 `data/seiyuu.json`，确认当前的 `pushMode`（`"W1"` 或 `"W2"`）以及全部关注声优/账号。
2. **刷新结构化日程源**：运行 `node scripts/sync-sources.mjs`，自动拉取并无损合并：
   - 番剧更新（AniList GraphQL API / しょぼいカレンダー）
   - 线下活动（Eventernote）
   - 关联 YouTube 频道 RSS（如 GA文庫チャンネル的『パジャナイ』）
   - 固定周期规则（如每月 1 号声グラ专栏）
   - **禁止覆盖** `data/schedule.json` 中已有的 `source: "manual"` 或已确认的 `source: "tweet"` 条目。
3. **巡检推特主页（内置 `browser` 子代理）**：
   - 访问 `data/seiyuu.json` 中每个声优的 `xHandle`（展示在推特记录 Tab）、`mergedXHandles`（如 Staff 号，合并展示在该声优的同一个头像流下并标明 `accountRole: "staff"` 区分本人与 Staff）以及 `scheduleOnlyXHandles`（仅用于挖掘日程，不写入推特记录头像栏）。
   - 若 `x.com` 提示需要登录，请暂停并请用户在浏览器面板手动登录一次后继续。
   - **采集范围（跳过置顶）**：通过 `x.com/<handle>/with_replies`（并核对主页 Posts 确保不遗漏纯转推）采集**原创发推（`original`）、引用发推（`quote`）、纯转发（`rt`）与回复（`reply`）**；**严禁收录置顶推文（直接跳过 `pinned`）**。
   - **提取日程**：阅读近期推文、引用与转推正文，识别未收录的新嘉宾出演、生放送、线下活动、专栏/节目预告，转换为标准 **JST 0–24 小时制（`00:00–23:59`）**，与 `data/schedule.json` 现有条目严格去重后写入（`source: "tweet"`）。
   - **维护 `data/tweets.json`**：只为 `xHandle`（及合并其 `mergedXHandles`）写入精简记录，**严禁保存推文日文原文、图片或视频文件**：
     - 头像栏顺序严格由 `data/seiyuu.json` 数组顺序定死，**绝不按更新条数调整声优顺序**。
     - 每次更新时对比该账号上一次的 `items` ID 集合，计算本次新增的推文条数写入该账号的 `newCount` 字段（前端点击头像后本地消红点；本次无新增则写 `0`）。
     - 为每条新增推文编写一句 **15～35 字中文客观总结** 写入 `summary`（历史已存在条目直接复用原 `summary`，不重复生成），并在带图/视频/GIF 时标注 `media`（`"photo"` / `"video"` / `"gif"`）与 `mediaCount`。
     - 类型细分：`original`（原创发推）、`quote`（引用发推，前端归在「发推」筛选下）、`rt`（纯转发，记录 `originalAuthor` 并保留主页相对顺序，时间记原推发布时间 JST）、`reply`（回复，记录 `replyTo`）。
     - 若存在 `mergedXHandles`（如本人号 + Staff 号合并），每条必须标注 `accountRole`（`"self"` / `"staff"`）与 `accountHandle`，合并后按最新在最上排序；单个账号则严格保持 **X 主页从上到下的顺序**。
     - 原创推文优先从 `<time datetime="...">` 提取精确到分钟的 JST 时间（`YYYY-MM-DD HH:mm`，`timePrecision: "minute"`），拿不到再填大致时间（`timePrecision: "approx"`）。
     - 转推（RT）标记 `type: "rt"`，保留其在 X 主页中的准确相对位置，时间记录原推发布时间（JST）并直链原推 URL。
4. **更新时间戳与校验**：
   - 确认 `data/schedule.json` 与 `data/tweets.json` 为合法 JSON 且更新 `updatedAt`（ISO 8601 `+09:00`）。
   - 校验所有日期时间均为 JST 0–24 小时制。
5. **按 `pushMode` 执行提交与推送**：
   - **`"W1"`（先确认再推）**：在回复中清晰列出本次变更清单（新增/更新的日程条目、来源、以及各账号新增推特记录条数），等待用户回复确认后，再执行 `git add data/ && git commit -m "chore: update schedule and tweets (YYYY-MM-DD)" && git push origin main`。
   - **`"W2"`（全自动推送）**：校验无误后直接执行 `git add`、`git commit`、`git push origin main`，并在回复中附带本次变更摘要。

## 二、快捷指令约定

- **切换更新模式**：当用户说「切到 W2」「以后更新完直接自动推」时，将 `data/config.json` 中的 `"pushMode"` 改为 `"W2"` 并提交推送；说「切回 W1」则改回 `"W1"`。
- **新增声优 / 修改固定规则 / 手动补录日程**：直接修改 `data/seiyuu.json` 或 `data/schedule.json`（手动补录设 `source: "manual"`），按当前 `pushMode` 提交推送。
