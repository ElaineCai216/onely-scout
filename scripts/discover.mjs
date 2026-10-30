import fs from "node:fs";
import path from "node:path";
import { buildQueries, dedupeCandidates, makeCandidate } from "./lib.mjs";

const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1] ?? true]);
  return pairs;
}, []));
const outputDir = String(options.output || "discovery-output");
const maxPerQuery = Math.min(20, Number(options.limit || 10));
const profile = {
  market: options.market || "United States",
  platforms: String(options.platforms || "TikTok,Instagram,YouTube Shorts").split(","),
  roles: String(options.roles || "social media manager,social media strategist,community manager").split(",")
};

const queries = buildQueries(profile);
const records = [];
for (const query of queries) {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(searchUrl, { headers: { "user-agent": "OnelyScoutResearch/1.0 (+evaluation-only)" } });
  if (!response.ok) {
    console.error(`Search skipped (${response.status}): ${query}`);
    continue;
  }
  const html = await response.text();
  const resultPattern = /result__a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?result__snippet[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  let count = 0;
  while ((match = resultPattern.exec(html)) && count < maxPerQuery) {
    const resolved = decodeDuckUrl(match[1]);
    if (!/linkedin\.com\/in\/|twine\.net\/|contra\.com\//.test(resolved)) continue;
    records.push({
      name: stripTags(match[2]),
      profileUrl: resolved,
      source: resolved.includes("linkedin.com") ? "LinkedIn public profile" : resolved.includes("twine.net") ? "Twine public portfolio" : "Contra public portfolio",
      snippet: stripTags(match[3])
    });
    count += 1;
  }
  console.error(`Discovered ${count}: ${query}`);
}

const { kept, duplicates } = dedupeCandidates(records);
const candidates = kept.map(makeCandidate).sort((a, b) => b.score - a.score);
fs.mkdirSync(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = path.join(outputDir, `candidates-${stamp}.json`);
fs.writeFileSync(outputPath, JSON.stringify({ profile, queries, counts: { raw: records.length, deduped: candidates.length, duplicates: duplicates.length }, candidates }, null, 2));
console.log(outputPath);

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
}

function decodeDuckUrl(value) {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    return url.searchParams.get("uddg") || url.href;
  } catch {
    return value;
  }
}
