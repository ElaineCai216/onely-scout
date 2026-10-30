const state = { candidates: [], filtered: [], grade: "all", search: "", page: 1, perPage: 12, selected: null, draftVersion: 0 };
const statusMap = { new: "待复核", reviewed: "已复核", drafted: "草稿已生成", approved: "已审批", replied: "已回复", onboarded: "已入驻" };
const titleMap = { overview: "增长作战总览", discovery: "公开目标发现", candidates: "候选人证据池", outreach: "AI 个性化触达", pipeline: "跟进与转化漏斗", compliance: "合规边界与审计" };
const auditEvents = [
  ["12:04:18", "DISCOVERY", "完成 9 组公开检索；保存 URL 与原始摘要", "success"],
  ["12:04:20", "DEDUPE", "按 canonical URL 与姓名/地区合并 9 条重复记录", "success"],
  ["12:04:22", "SCORING", "120 条记录完成可解释规则评分", "success"],
  ["12:06:03", "OUTREACH", "为 P0 队列生成个性化草稿；未发送", "draft only"],
  ["12:08:41", "SAFETY", "发送连接器未配置，系统保持安全演示模式", "locked"]
];

init();

async function init() {
  const payload = await fetch("./data/candidates.json").then((response) => response.json());
  state.candidates = payload.candidates;
  state.filtered = [...state.candidates];
  state.selected = state.candidates[0];
  renderAll();
  bindEvents();
}

function renderAll() {
  renderMetrics();
  renderFunnel();
  renderPriority();
  renderSources();
  renderCandidates();
  renderOutreach();
  renderPipeline();
  renderAudit();
  document.querySelector("#navCount").textContent = state.candidates.length;
}

function renderMetrics() {
  const aCount = state.candidates.filter((c) => c.grade === "A").length;
  const metrics = [
    ["公开发现", "227", "+227", "9 组查询 · 3 个来源"],
    ["去重后候选", String(state.candidates.length), "-9 重复", "每条可回溯到公开主页"],
    ["A级优先", String(aCount), `${Math.round(aCount / state.candidates.length * 100)}%`, "美国 + 平台 + creator 强信号"],
    ["真实发送", "0", "已锁定", "笔试期间仅生成草稿"]
  ];
  document.querySelector("#metrics").innerHTML = metrics.map(([label, value, change, note]) => `<div class="metric"><div class="metric-top"><span>${label}</span><i>${change}</i></div><b>${value}</b><small>${note}</small></div>`).join("");
}

function renderFunnel() {
  const stages = [["公开发现",1500],["合格",600],["人工批准触达",500],["有效回复",220],["意向",150],["入驻",100]];
  document.querySelector("#funnel").innerHTML = stages.map(([label, value]) => `<div class="funnel-stage"><div class="funnel-bar" style="height:${Math.max(18, value / 11)}px"></div><b>${value.toLocaleString()}</b><span>${label}</span></div>`).join("");
}

function renderPriority() {
  document.querySelector("#priorityList").innerHTML = state.candidates.slice(0, 5).map((c) => `<div class="priority-person" data-id="${c.id}"><div class="avatar">${initials(c.name)}</div><div class="person-copy"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.matchReasons[0])}</small></div><div class="score">${c.score}</div><div class="priority">${c.priority}</div></div>`).join("");
}

function renderSources() {
  const totals = state.candidates.reduce((acc, c) => (acc[c.source] = (acc[c.source] || 0) + 1, acc), {});
  const colors = ["#7457ff", "#2f9b6d", "#d29132"];
  document.querySelector("#sourceBars").innerHTML = Object.entries(totals).map(([name, count], i) => `<div class="source-row"><div class="source-top"><span>${name}</span><b>${count}</b></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(count / state.candidates.length * 100)}%;background:${colors[i % colors.length]}"></div></div></div>`).join("");
}

function applyFilters() {
  const query = state.search.toLowerCase().trim();
  state.filtered = state.candidates.filter((c) => (state.grade === "all" || c.grade === state.grade) && (!query || `${c.name} ${c.snippet} ${c.matchReasons.join(" ")}`.toLowerCase().includes(query)));
  const maxPage = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
  state.page = Math.min(state.page, maxPage);
  renderCandidates();
}

function renderCandidates() {
  const start = (state.page - 1) * state.perPage;
  const items = state.filtered.slice(start, start + state.perPage);
  document.querySelector("#candidateRows").innerHTML = items.map((c) => `<tr data-id="${c.id}"><td><div class="candidate-cell"><div class="avatar">${initials(c.name)}</div><div><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.location)} · ${escapeHtml(c.headline)}</small></div></div></td><td><a class="source-link" href="${c.profileUrl}" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">${escapeHtml(c.source)} ↗</a></td><td class="reason-cell">${c.matchReasons.slice(0,2).map((r) => `<span>${escapeHtml(r)}</span>`).join("")}</td><td><span class="grade ${c.grade}">${c.grade}</span> <b>${c.score}</b></td><td><span class="priority">${c.priority}</span></td><td><span class="state">${statusMap[c.status]}</span></td></tr>`).join("");
  document.querySelector("#resultCount").textContent = `${state.filtered.length} 名候选人`;
  document.querySelector("#pageInfo").textContent = `${state.page} / ${Math.max(1, Math.ceil(state.filtered.length / state.perPage))}`;
}

function renderOutreach() {
  const people = state.candidates.filter((c) => c.grade === "A").slice(0, 7);
  document.querySelector("#outreachPeople").innerHTML = people.map((c) => `<div class="person-option ${state.selected?.id === c.id ? "active" : ""}" data-id="${c.id}"><div class="avatar">${initials(c.name)}</div><div><strong>${escapeHtml(c.name)}</strong><small>${c.priority} · ${escapeHtml(c.location)}</small></div><div class="score">${c.score}</div></div>`).join("");
  if (state.selected) {
    document.querySelector("#draftName").textContent = `给 ${state.selected.name} 的首触达`;
    document.querySelector("#draftEvidence").innerHTML = `<strong>引用证据：</strong> ${state.selected.matchReasons.slice(0,2).map(escapeHtml).join("；")}。来源：${escapeHtml(state.selected.source)}`;
    document.querySelector("#draftText").value = makeDraft(state.selected, state.draftVersion);
  }
}

function makeDraft(c, version = 0) {
  const first = c.name.split(/\s+/)[0];
  const evidence = c.matchReasons[0] || "你在社媒增长方面的经历";
  const variants = [
`Hi ${first} — I came across your public profile while researching US social operators and noticed your experience with ${evidence.replace("覆盖 ", "")}.

I’m helping Onely invite a small first cohort of operators for an AI-powered creator business platform spanning content, audience growth, fan relationships, and monetization. Your background looks especially relevant to the social-to-community loop we’re testing.

Would you be open to a 15-minute look at the operator beta? No pressure—happy to send a one-page overview first. If this isn’t relevant, just say so and I won’t follow up.

Best,\n+Cai Yiling · Onely pilot team`,
`Hi ${first}, quick note after seeing your public work in social operations—especially the signal that you ${evidence.toLowerCase()}.

Onely is building an AI-assisted workspace for creator teams: content production, social growth, fan relationships, subscriptions, and commerce in one loop. We’re speaking with experienced US-market operators to shape the first operating cohort.

Would a short beta walkthrough be useful? I can send context here first, and I’ll only follow up if you opt in.

— Cai Yiling`
  ];
  return variants[version % variants.length];
}

function renderPipeline() {
  const metrics = [["待复核",120],["草稿完成",84],["已审批",0],["有效回复",0],["已入驻",0]];
  document.querySelector("#pipelineMetrics").innerHTML = metrics.map(([l,v]) => `<div class="metric"><div class="metric-top"><span>${l}</span></div><b>${v}</b><small>${v === 0 ? "演示未真实触达" : "本地演示数据"}</small></div>`).join("");
  const cols = [
    ["新发现", state.candidates.slice(0,4)],
    ["已复核", state.candidates.slice(8,12)],
    ["草稿完成", state.candidates.slice(16,20)],
    ["已回复", []],
    ["已入驻", []]
  ];
  document.querySelector("#kanban").innerHTML = cols.map(([label, items]) => `<div class="kanban-col"><div class="kanban-head">${label}<span>${items.length}</span></div>${items.length ? items.map((c) => `<div class="kanban-card"><strong>${escapeHtml(c.name)}</strong><small>${c.priority} · ${c.score} 分</small></div>`).join("") : `<div class="kanban-card"><small>等待真实审批与候选人主动回复</small></div>`}</div>`).join("");
}

function renderAudit() {
  document.querySelector("#auditLog").innerHTML = auditEvents.map((e) => `<div class="audit-row"><span>2026-10-30 ${e[0]}</span><strong>${e[1]}</strong><span>${e[2]}</span><em>${e[3]}</em></div>`).join("");
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
  document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.jump)));
  document.querySelector("#candidateSearch").addEventListener("input", (event) => { state.search = event.target.value; state.page = 1; applyFilters(); });
  document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll(".filter").forEach((b) => b.classList.remove("active")); button.classList.add("active"); state.grade = button.dataset.grade; state.page = 1; applyFilters(); }));
  document.querySelector("#prevPage").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; renderCandidates(); } });
  document.querySelector("#nextPage").addEventListener("click", () => { if (state.page < Math.ceil(state.filtered.length / state.perPage)) { state.page += 1; renderCandidates(); } });
  document.addEventListener("click", (event) => {
    const row = event.target.closest("[data-id]");
    if (!row || event.target.closest(".person-option")) return;
    const candidate = state.candidates.find((c) => c.id === row.dataset.id);
    if (candidate) openDrawer(candidate);
  });
  document.querySelector("#outreachPeople").addEventListener("click", (event) => { const row = event.target.closest(".person-option"); if (!row) return; state.selected = state.candidates.find((c) => c.id === row.dataset.id); state.draftVersion = 0; renderOutreach(); });
  document.querySelector("#regenerate").addEventListener("click", () => { state.draftVersion += 1; renderOutreach(); toast("已基于相同公开证据生成新版本"); });
  document.querySelector("#runDiscovery").addEventListener("click", runDiscoveryAnimation);
  document.querySelector("#exportCsv").addEventListener("click", exportCsv);
  document.querySelector("#downloadLog").addEventListener("click", exportLog);
  document.querySelector("#openImport").addEventListener("click", () => document.querySelector("#importDialog").showModal());
  document.querySelector("#processImport").addEventListener("click", processImport);
  document.querySelectorAll("[data-close]").forEach((element) => element.addEventListener("click", closeDrawer));
}

function navigate(view) {
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  document.querySelector("#pageTitle").textContent = titleMap[view];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function runDiscoveryAnimation() {
  const button = document.querySelector("#runDiscovery");
  const status = document.querySelector("#runStatus");
  button.disabled = true; button.textContent = "正在运行…"; status.className = "status running"; status.textContent = "运行中";
  const steps = [...document.querySelectorAll(".step")];
  steps.forEach((step) => step.classList.remove("done", "running"));
  for (const step of steps) {
    step.classList.add("running");
    await new Promise((resolve) => setTimeout(resolve, 430));
    step.classList.remove("running"); step.classList.add("done");
  }
  status.className = "status done"; status.textContent = "已完成"; button.disabled = false; button.textContent = "再次运行公开信息发现";
  toast("发现完成：227 条原始结果 → 120 条可核验候选");
}

function openDrawer(c) {
  document.querySelector("#drawerContent").innerHTML = `<div class="drawer-hero"><div class="avatar">${initials(c.name)}</div><h2>${escapeHtml(c.name)}</h2><p>${escapeHtml(c.headline)} · ${escapeHtml(c.location)}</p><div class="drawer-score"><span class="grade ${c.grade}">${c.grade}</span><span class="tag violet">${c.score} / 100</span><span class="priority">${c.priority}</span></div></div><div class="drawer-section"><h3>为什么匹配</h3><ul>${c.matchReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul></div><div class="drawer-section"><h3>公开证据摘要</h3><p>${escapeHtml(c.snippet)}</p></div><div class="drawer-section"><h3>联系方式来源</h3><p>${escapeHtml(c.contactMethod)}</p><a class="source-link" href="${c.contactSourceUrl}" target="_blank" rel="noreferrer">核验公开主页 ↗</a></div><div class="drawer-section"><h3>数据边界</h3><p>未保存私人邮箱、手机号或敏感属性。当前状态：未联系。</p></div><div class="drawer-actions"><button class="primary" id="draftFromDrawer">生成触达草稿</button><button class="ghost" data-close-inner>关闭</button></div>`;
  document.querySelector("#candidateDrawer").classList.add("open");
  document.querySelector("#candidateDrawer").setAttribute("aria-hidden", "false");
  document.querySelector("#draftFromDrawer").addEventListener("click", () => { state.selected = c; state.draftVersion = 0; renderOutreach(); closeDrawer(); navigate("outreach"); });
  document.querySelector("[data-close-inner]").addEventListener("click", closeDrawer);
}

function closeDrawer() { document.querySelector("#candidateDrawer").classList.remove("open"); document.querySelector("#candidateDrawer").setAttribute("aria-hidden", "true"); }

function processImport() {
  const lines = document.querySelector("#importText").value.split(/\n/).filter(Boolean);
  const existing = new Set(state.candidates.map((c) => normalizeUrl(c.profileUrl)));
  const local = new Set(); let kept = 0; let duplicates = 0; let invalid = 0;
  for (const line of lines) {
    const [name, url] = line.split(",").map((value) => value.trim());
    const key = normalizeUrl(url || "");
    if (!name || !/^https?:\/\//.test(key)) { invalid += 1; continue; }
    if (existing.has(key) || local.has(key)) duplicates += 1; else { local.add(key); kept += 1; }
  }
  document.querySelector("#importResult").textContent = `校验完成：${kept} 条可导入，${duplicates} 条重复，${invalid} 条无效。演示不写入私人数据。`;
}

function exportCsv() {
  const header = ["name","profile_url","contact_source","score","grade","priority","status","match_reason"];
  const lines = state.filtered.map((c) => [c.name,c.profileUrl,c.contactSourceUrl,c.score,c.grade,c.priority,statusMap[c.status],c.matchReasons.join("; ")].map(csvCell).join(","));
  download([header.join(","), ...lines].join("\n"), "onely-candidate-pool.csv", "text/csv");
  toast(`已导出 ${state.filtered.length} 条可核验候选记录`);
}

function exportLog() { download(JSON.stringify({ exportedAt: new Date().toISOString(), safetyMode: true, messagesSent: 0, events: auditEvents }, null, 2), "onely-audit-log.json", "application/json"); }
function download(content, name, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement("a"), { href: url, download: name }); a.click(); URL.revokeObjectURL(url); }
function csvCell(value) { return `"${String(value ?? "").replaceAll('"','""')}"`; }
function normalizeUrl(value) { try { const url = new URL(value); url.hash=""; url.search=""; url.hostname=url.hostname.replace(/^www\./,""); url.pathname=url.pathname.replace(/\/+$/,""); return url.toString().replace(/\/$/,""); } catch { return value; } }
function initials(name) { return name.split(/\s+/).slice(0,2).map((part) => part[0] || "").join(""); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[char])); }
function toast(message) { const el = document.querySelector("#toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2500); }
