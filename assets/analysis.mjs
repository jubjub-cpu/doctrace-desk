const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
  "in", "is", "it", "of", "on", "or", "the", "to", "what", "when", "which",
  "who", "with"
]);

const SYNONYMS = {
  approval: ["approve", "threshold", "written", "manager", "director"],
  response: ["respond", "severity", "technician", "support", "hours", "minutes"],
  obligation: ["must", "require", "notice", "term"],
  end: ["termination", "non-renewal", "ends", "notice"],
  price: ["fee", "annual", "invoiced", "cost"],
  changed: ["amendment", "addendum", "proposed", "baseline"]
};

export function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9$-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function expandedTokens(query) {
  const base = tokenize(query);
  const expanded = new Set(base);
  base.forEach((token) => {
    (SYNONYMS[token] || []).forEach((item) => expanded.add(item));
  });
  return expanded;
}

export function rankLines(packet, query, limit = 6) {
  const terms = expandedTokens(query);
  if (!terms.size) return [];

  return packet.documents
    .flatMap((document) => document.clauses.map((clause, index) => ({
      documentId: document.id,
      documentTitle: document.title,
      documentVersion: document.version,
      documentRole: document.role,
      section: clause.section,
      line: index + 1,
      text: clause.text
    })))
    .map((entry) => {
      const lineTokens = new Set(tokenize(entry.text));
      let score = 0;
      terms.forEach((term) => {
        if (lineTokens.has(term)) score += term.length > 6 ? 4 : 2;
        if (entry.text.toLowerCase().includes(term)) score += 1;
      });
      if (score > 0 && entry.documentRole === "current") score += 0.75;
      if (score > 0 && /must|required|approval|notice|response/i.test(entry.text)) score += 0.5;
      return { ...entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.documentTitle.localeCompare(b.documentTitle) || a.line - b.line)
    .slice(0, limit);
}

export function composeAnswer(results) {
  if (!results.length) {
    return "No direct evidence matched this question. Try terms such as approval, response, fee, notice, data, or term.";
  }

  const selected = [];
  const seenSections = new Set();
  for (const result of results) {
    const key = `${result.documentRole}:${result.section}`;
    if (!seenSections.has(key)) {
      selected.push(result);
      seenSections.add(key);
    }
    if (selected.length === 3) break;
  }

  return selected.map((item) => item.text).join(" ");
}

function currentDocuments(packet) {
  const preferred = packet.documents.filter((document) => document.role === "current");
  return preferred.length ? preferred : packet.documents;
}

const FIELD_PATTERNS = [
  ["Vendor", /Vendor:\s*([^.;]+)/i],
  ["Term", /Term:\s*([^.;]+)/i],
  ["Annual fee", /Annual fee:\s*(\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i],
  ["High-severity response", /High-severity response:\s*([^.;]+)/i],
  ["Approval threshold", /Approval threshold:\s*([^.;]+)/i],
  ["Non-renewal notice", /Non-renewal notice:\s*([^.;]+)/i],
  ["Data scope", /Data scope:\s*([^.;]+)/i]
];

export function extractFields(packet) {
  const lines = currentDocuments(packet).flatMap((document) => document.clauses.map((clause, index) => ({
    documentId: document.id,
    documentTitle: document.title,
    section: clause.section,
    line: index + 1,
    text: clause.text
  })));

  return FIELD_PATTERNS.map(([label, pattern]) => {
    for (const line of lines) {
      const match = line.text.match(pattern);
      if (match) return { label, value: match[1].trim(), source: line };
    }
    return { label, value: "Not found", source: null };
  });
}

export function compareVersions(packet) {
  const baseline = packet.documents.find((document) => document.role === "baseline");
  const current = packet.documents.find((document) => document.role === "current");
  if (!baseline || !current) return [];

  const before = new Map(baseline.clauses.map((clause) => [clause.section, clause.text]));
  const after = new Map(current.clauses.map((clause) => [clause.section, clause.text]));
  const sections = [...new Set([...before.keys(), ...after.keys()])].sort();

  return sections.map((section) => {
    const oldText = before.get(section) || "";
    const newText = after.get(section) || "";
    const status = !oldText ? "added" : !newText ? "removed" : oldText === newText ? "unchanged" : "changed";
    return {
      section,
      status,
      before: oldText,
      after: newText,
      baselineTitle: baseline.title,
      currentTitle: current.title
    };
  });
}

export function buildRiskFlags(fields, changes) {
  const flags = [];
  const changedSections = new Set(changes.filter((change) => change.status === "changed").map((change) => change.section));
  if (changedSections.has("3.1")) flags.push("Commercial terms changed; confirm budget ownership before approval.");
  if (changedSections.has("4.2")) flags.push("Service response obligation changed; verify the operating team can measure it.");
  if (changedSections.has("5.3")) flags.push("Approval threshold changed; confirm the new control point with the named owner.");
  if (changedSections.has("7.1")) flags.push("Notice or termination language changed; schedule a reviewer check before the deadline.");
  if (fields.some((field) => field.value === "Not found")) flags.push("One or more required structured fields could not be extracted.");
  return flags.length ? flags : ["No material rule changes detected by the deterministic comparison."];
}

export function buildReviewSummary({ packet, query, results, verifiedIds, fields, changes, fieldsReviewed, decision }) {
  const verified = results.filter((item) => verifiedIds.includes(`${item.documentId}:${item.line}`));
  const materialChanges = changes.filter((item) => item.status !== "unchanged");
  return [
    `DOCUTRACE REVIEW SUMMARY`,
    `Packet: ${packet.title} (${packet.reference})`,
    `Question: ${query}`,
    `Decision: ${decision}`,
    `Structured fields reviewed: ${fieldsReviewed ? "Yes" : "No"}`,
    `Verified citations: ${verified.length}`,
    "",
    "VERIFIED EVIDENCE",
    ...(verified.length ? verified.map((item) => `- ${item.text} [${item.documentTitle}, section ${item.section}, line ${item.line}]`) : ["- None"]),
    "",
    "STRUCTURED FIELDS",
    ...fields.map((field) => `- ${field.label}: ${field.value}`),
    "",
    "MATERIAL VERSION CHANGES",
    ...(materialChanges.length ? materialChanges.map((item) => `- Section ${item.section}: ${item.status}`) : ["- None"]),
    "",
    "This synthetic demonstration is not legal advice and requires human verification."
  ].join("\n");
}
