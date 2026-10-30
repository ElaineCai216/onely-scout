import fs from "node:fs";
import path from "node:path";
import { dedupeCandidates, makeCandidate } from "./lib.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const inputDir = args.input || "/tmp";
const outputFile = args.output || "dist/data/candidates.json";
const limit = Number(args.limit || 120);
const files = fs.readdirSync(inputDir).filter((name) => /^onely_exa_(linkedin|twine).*\.txt$/.test(name));
const raw = [];

for (const file of files) {
  const sourceText = fs.readFileSync(path.join(inputDir, file), "utf8");
  for (const block of sourceText.split(/\n---\n/)) {
    const title = block.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
    const profileUrl = block.match(/^URL:\s*(https?:\/\/[^\s]+)$/m)?.[1]?.trim();
    if (!title || !profileUrl || /\/projects\/|\/find\//.test(profileUrl)) continue;
    if (!/linkedin\.com\/in\/|twine\.net\//.test(profileUrl)) continue;
    const snippet = block.split(/^Highlights:\s*$/m)[1] || block;
    raw.push({
      name: title.replace(/'s portfolio on Twine$/i, "").replace(/\s+-\s+Social Media.*$/, ""),
      profileUrl,
      source: profileUrl.includes("linkedin.com") ? "LinkedIn public profile" : "Twine public portfolio",
      snippet
    });
  }
}

const { kept, duplicates } = dedupeCandidates(raw);
const candidates = kept.slice(0, limit).map(makeCandidate).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify({
  meta: {
    generatedAt: "2026-10-30T12:00:00+08:00",
    sourceFiles: files.length,
    rawDiscovered: raw.length,
    duplicatesRemoved: duplicates.length,
    candidateCount: candidates.length,
    note: "Public profile snapshot for evaluation only. No messages were sent."
  },
  candidates
}, null, 2));
console.log(`Wrote ${candidates.length} candidates to ${outputFile}; removed ${duplicates.length} duplicates.`);
