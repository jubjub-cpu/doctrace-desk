import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildReviewSummary,
  buildRiskFlags,
  compareVersions,
  composeAnswer,
  extractFields,
  rankLines,
  tokenize
} from "../assets/analysis.mjs";

const fixture = JSON.parse(await readFile(new URL("../data/packets.json", import.meta.url), "utf8"));
const northstar = fixture.packets.find((packet) => packet.id === "northstar-renewal");
const harborline = fixture.packets.find((packet) => packet.id === "harborline-logistics");

assert.ok(northstar, "Northstar fixture should exist");
assert.ok(harborline, "Harborline fixture should exist");
assert.deepEqual(tokenize("What REQUIRES approval?"), ["requires", "approval"]);

const approvalResults = rankLines(northstar, "What requires approval?", 6);
assert.ok(approvalResults.length >= 2, "Approval search should return multiple cited lines");
assert.ok(approvalResults.some((item) => item.section === "5.3"), "Approval search should include the threshold clause");
assert.ok(approvalResults.every((item) => item.documentId && item.line > 0), "Every result should retain a source and line");

const noResults = rankLines(northstar, "quantum penguin telemetry");
assert.equal(noResults.length, 0, "Unrelated terms should return an empty evidence state");
assert.match(composeAnswer([]), /No direct evidence matched/);

const fields = extractFields(northstar);
assert.equal(fields.length, 7, "Seven review fields should be extracted");
assert.equal(fields.find((field) => field.label === "Annual fee").value, "$136,800");
assert.match(fields.find((field) => field.label === "High-severity response").value, /two business hours/i);

const changes = compareVersions(northstar);
assert.equal(changes.find((item) => item.section === "8.4").status, "unchanged");
assert.equal(changes.find((item) => item.section === "5.3").status, "changed");
assert.ok(changes.filter((item) => item.status === "changed").length >= 4, "The renewal should expose material changes");

const harborChanges = compareVersions(harborline);
assert.equal(harborChanges.find((item) => item.section === "4.2").status, "changed");

const risks = buildRiskFlags(fields, changes);
assert.ok(risks.some((risk) => /approval threshold/i.test(risk)));
assert.ok(risks.some((risk) => /response obligation/i.test(risk)));

const verified = approvalResults[0];
const summary = buildReviewSummary({
  packet: northstar,
  query: "What requires approval?",
  results: approvalResults,
  verifiedIds: [`${verified.documentId}:${verified.line}`],
  fields,
  changes,
  fieldsReviewed: true,
  decision: "Approved by human reviewer"
});
assert.match(summary, /VERIFIED EVIDENCE/);
assert.match(summary, /Approved by human reviewer/);
assert.match(summary, new RegExp(verified.documentTitle));
assert.match(summary, /not legal advice/i);

console.log("DOCUTRACE LOGIC TESTS PASSED");
console.log("Checked retrieval, empty results, extraction, version comparison, risk flags, and review-summary evidence.");
