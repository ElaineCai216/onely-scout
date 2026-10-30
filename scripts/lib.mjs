import { createHash } from "node:crypto";

export const PROFILE_TERMS = ["social media", "content strategist", "community manager", "creator marketing", "influencer"];
export const PLATFORM_TERMS = ["tiktok", "instagram", "youtube", "shorts", "reels"];

export function normalizeUrl(value = "") {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, "");
  }
}

export function normalizeName(value = "") {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeCandidates(rows) {
  const seenUrls = new Set();
  const seenNames = new Set();
  const kept = [];
  const duplicates = [];
  for (const row of rows) {
    const urlKey = normalizeUrl(row.profileUrl);
    const nameKey = `${normalizeName(row.name)}|${(row.location || "").toLowerCase()}`;
    if ((urlKey && seenUrls.has(urlKey)) || (nameKey !== "|" && seenNames.has(nameKey))) {
      duplicates.push({ ...row, duplicateReason: seenUrls.has(urlKey) ? "same_profile_url" : "same_name_location" });
      continue;
    }
    if (urlKey) seenUrls.add(urlKey);
    if (nameKey !== "|") seenNames.add(nameKey);
    kept.push({ ...row, profileUrl: urlKey });
  }
  return { kept, duplicates };
}

export function scoreCandidate(candidate) {
  const text = `${candidate.name} ${candidate.snippet || ""}`.toLowerCase();
  const hits = {
    role: PROFILE_TERMS.filter((term) => text.includes(term)),
    platforms: PLATFORM_TERMS.filter((term) => text.includes(term)),
    usa: /united states|\busa\b|new york|los angeles|california|texas|florida|chicago|atlanta|austin|seattle|boston|brooklyn|phoenix/.test(text),
    creator: /creator|influencer|ugc|fan|community/.test(text),
    proof: /\b\d+[km%+]|million|grew|growth|views|engagement|revenue/.test(text),
    available: /freelance|available to hire|consultant|contract|founder/.test(text)
  };
  let score = 10;
  score += Math.min(20, hits.role.length * 10);
  score += Math.min(22, hits.platforms.length * 7);
  score += hits.usa ? 18 : 0;
  score += hits.creator ? 13 : 0;
  score += hits.proof ? 9 : 0;
  score += hits.available ? 8 : 0;
  score = Math.min(99, score);
  const reasons = [];
  if (hits.platforms.length) reasons.push(`覆盖 ${hits.platforms.slice(0, 3).join(" / ")}`);
  if (hits.usa) reasons.push("具备美国市场或所在地证据");
  if (hits.creator) reasons.push("有创作者 / 社群运营相关经历");
  if (hits.proof) reasons.push("公开资料含增长或效果数据");
  if (hits.available) reasons.push("存在自由职业或合作可用性信号");
  if (!reasons.length) reasons.push("职位关键词命中，需人工复核");
  return { score, grade: score >= 78 ? "A" : score >= 58 ? "B" : "C", reasons, hits };
}

export function makeCandidate(input, index = 0) {
  const scored = scoreCandidate(input);
  const slug = createHash("sha1").update(normalizeUrl(input.profileUrl) || `${input.name}-${index}`).digest("hex").slice(0, 10);
  const locationMatch = (input.snippet || "").match(/([A-Z][A-Za-z .'-]+,\s*(?:[A-Z][A-Za-z .'-]+,\s*)?United States)/);
  return {
    id: `cand_${slug}`,
    name: input.name.replace(/\s+-\s+.*$/, "").trim(),
    headline: input.headline || inferHeadline(input.snippet),
    location: input.location || locationMatch?.[1] || (scored.hits.usa ? "United States" : "需复核"),
    profileUrl: normalizeUrl(input.profileUrl),
    source: input.source || "LinkedIn public profile",
    contactMethod: input.contactMethod || "公开主页内 Message / Contact info（仅人工批准后使用）",
    contactSourceUrl: normalizeUrl(input.contactSourceUrl || input.profileUrl),
    snippet: cleanSnippet(input.snippet),
    score: scored.score,
    grade: scored.grade,
    matchReasons: scored.reasons,
    priority: scored.grade === "A" ? "P0" : scored.grade === "B" ? "P1" : "P2",
    status: ["new", "reviewed", "drafted"][index % 3],
    importedAt: "2026-10-30T09:00:00.000Z",
    lastAction: "公开信息发现",
    consent: "not_contacted"
  };
}

function inferHeadline(text = "") {
  const line = text.split("\n").map((part) => part.trim()).find((part) => /social media|content strategist|community manager|creator/i.test(part));
  return (line || "Social media operations candidate").replace(/^#+\s*/, "").slice(0, 110);
}

function cleanSnippet(text = "") {
  return text.replace(/\s+/g, " ").trim().slice(0, 360);
}

export function buildQueries(profile = {}) {
  const market = profile.market || "United States";
  const platforms = (profile.platforms || ["TikTok", "Instagram"]).join(" ");
  const roles = profile.roles || ["social media manager", "social media strategist", "community manager"];
  return roles.flatMap((role) => [
    `site:linkedin.com/in \"${role}\" \"${market}\" ${platforms}`,
    `site:twine.net \"${role}\" \"${market}\" ${platforms} creator`,
    `site:contra.com ${role} ${platforms} ${market}`
  ]);
}
