import fs from "node:fs";
import path from "node:path";
import { buildQueries, dedupeCandidates, isCandidateProfileUrl, makeCandidate } from "./lib.mjs";

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
  const results = await searchPublicWeb(query);
  let count = 0;
  for (const result of results) {
    if (count >= maxPerQuery) break;
    const resolved = decodeDuckUrl(result.url);
    if (!isCandidateProfileUrl(resolved)) continue;
    records.push({
      name: stripTags(result.title),
      profileUrl: resolved,
      source: resolved.includes("linkedin.com") ? "LinkedIn public profile" : resolved.includes("twine.net") ? "Twine public portfolio" : "Contra public portfolio",
      snippet: stripTags(result.snippet)
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

async function searchPublicWeb(query) {
  const headers = { "user-agent": "OnelyScoutResearch/1.0 (+evaluation-only)" };
  const results = [];
  try {
    const rssUrl = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
    const response = await fetch(rssUrl, { headers });
    if (response.ok) {
      const xml = await response.text();
      const pattern = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<\/item>/g;
      let match;
      while ((match = pattern.exec(xml))) results.push({ title: decodeEntities(match[1]), url: decodeEntities(match[2]), snippet: decodeEntities(match[3]) });
    }
  } catch (error) {
    console.error(`Bing RSS fallback: ${error.message}`);
  }
  if (results.some((item) => isCandidateProfileUrl(item.url))) return results;
  try {
    const duckUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(duckUrl, { headers });
    if (!response.ok) return results;
    const html = await response.text();
    const pattern = /result__a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?result__snippet[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = pattern.exec(html))) results.push({ url: match[1], title: match[2], snippet: match[3] });
  } catch (error) {
    console.error(`DuckDuckGo fallback: ${error.message}`);
  }
  return results;
}

function decodeEntities(value) {
  return value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
