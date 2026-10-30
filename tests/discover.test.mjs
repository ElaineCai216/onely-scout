import test from "node:test";
import assert from "node:assert/strict";
import { buildQueries, dedupeCandidates, normalizeUrl, scoreCandidate } from "../scripts/lib.mjs";

test("normalizes tracking-free profile URLs", () => {
  assert.equal(normalizeUrl("https://www.linkedin.com/in/example/?trk=abc#top"), "https://linkedin.com/in/example");
});

test("deduplicates by canonical URL and name/location", () => {
  const { kept, duplicates } = dedupeCandidates([
    { name: "Alex Lee", location: "New York", profileUrl: "https://linkedin.com/in/alex" },
    { name: "Alex Lee", location: "New York", profileUrl: "https://www.linkedin.com/in/alex/?trk=x" },
    { name: "Alex Lee", location: "New York", profileUrl: "https://twine.net/alex" }
  ]);
  assert.equal(kept.length, 1);
  assert.equal(duplicates.length, 2);
});

test("scores US creator and short-form evidence above generic profiles", () => {
  const strong = scoreCandidate({ name: "Social Media Manager", snippet: "Los Angeles, United States. Grew creator TikTok and Instagram to 2M views; freelance." });
  const weak = scoreCandidate({ name: "Marketing Assistant", snippet: "Maintained newsletters." });
  assert.ok(strong.score > weak.score);
  assert.equal(strong.grade, "A");
});

test("builds source-specific discovery queries from target profile", () => {
  const queries = buildQueries({ market: "United States", platforms: ["TikTok"], roles: ["community manager"] });
  assert.equal(queries.length, 3);
  assert.ok(queries.every((query) => query.includes("community manager")));
});
