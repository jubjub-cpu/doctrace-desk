import {
  buildReviewSummary,
  buildRiskFlags,
  compareVersions,
  composeAnswer,
  extractFields,
  rankLines
} from "./analysis.mjs";

const app = document.querySelector("#app");

const state = {
  packets: [],
  activePacketId: "",
  query: "",
  activeTab: "evidence",
  results: [],
  fields: [],
  changes: [],
  risks: [],
  analyzed: false,
  analyzing: false,
  validation: "",
  verified: new Set(),
  fieldsReviewed: false,
  selectedSourceId: "",
  selectedSourceLine: 0,
  decision: "pending",
  history: []
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function activePacket() {
  return state.packets.find((packet) => packet.id === state.activePacketId) || state.packets[0];
}

function activeSource(packet) {
  return packet.documents.find((document) => document.id === state.selectedSourceId) || packet.documents[0];
}

function citationId(item) {
  return `${item.documentId}:${item.line}`;
}

function decisionLabel() {
  if (state.decision === "approved") return "Approved by human reviewer";
  if (state.decision === "returned") return "Returned for clarification";
  return "Human decision pending";
}

function addHistory(message) {
  state.history.push(message);
}

function resetReview(packet, message = "Packet opened for review.") {
  state.query = packet.suggestedQuestion;
  state.activeTab = "evidence";
  state.results = [];
  state.fields = extractFields(packet);
  state.changes = compareVersions(packet);
  state.risks = buildRiskFlags(state.fields, state.changes);
  state.analyzed = false;
  state.analyzing = false;
  state.validation = "";
  state.verified = new Set();
  state.fieldsReviewed = false;
  state.selectedSourceId = packet.documents[0].id;
  state.selectedSourceLine = 0;
  state.decision = "pending";
  state.history = [message, "Deterministic local analysis ready."];
}

function renderPacketRail(packet) {
  return `
    <aside class="packet-rail" aria-label="Synthetic review packets">
      <div class="rail-heading">
        <p class="eyebrow">Review queue</p>
        <h2>${state.packets.length} synthetic packets</h2>
        <p>Choose a packet to start a separate review.</p>
      </div>
      <div class="packet-list">
        ${state.packets.map((item) => `
          <button class="packet-button" type="button" data-packet="${item.id}" aria-pressed="${item.id === packet.id}">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.reference)}</span>
            <span>${item.documents.length} source documents</span>
          </button>
        `).join("")}
      </div>
      <p class="rail-note">All people, organizations, sites, terms, and events are fictional. Analysis stays in this browser.</p>
    </aside>
  `;
}

function renderTabs() {
  const tabs = [
    ["evidence", "Evidence", state.results.length],
    ["changes", "Version changes", state.changes.filter((item) => item.status !== "unchanged").length],
    ["fields", "Structured fields", state.fields.length]
  ];
  return `
    <div class="tab-list" role="tablist" aria-label="Review views">
      ${tabs.map(([id, label, count]) => `
        <button type="button" role="tab" id="tab-${id}" data-tab="${id}" aria-selected="${state.activeTab === id}" aria-controls="panel-${id}">
          ${label} <span aria-label="${count} items">${count}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderEvidence() {
  if (state.analyzing) {
    return `<div class="empty-state"><div><strong>Reviewing source lines...</strong><p>Ranking exact evidence and retaining source references.</p><div class="loading-bar" aria-hidden="true"><span></span></div></div></div>`;
  }
  if (!state.analyzed) {
    return `<div class="empty-state"><div><strong>Ask a focused review question</strong><p>The answer will remain tied to exact source lines. No response is treated as verified automatically.</p></div></div>`;
  }
  if (!state.results.length) {
    return `<div class="empty-state"><div><strong>No direct evidence found</strong><p>Try approval, response, fee, notice, data, term, or a phrase from the packet.</p></div></div>`;
  }

  return `
    <div class="answer-summary">
      <h3>Evidence-backed draft answer</h3>
      <p>${escapeHtml(composeAnswer(state.results))}</p>
    </div>
    <div class="citation-list">
      ${state.results.map((item) => {
        const id = citationId(item);
        const verified = state.verified.has(id);
        return `
          <article class="citation-row ${verified ? "is-verified" : ""}">
            <div class="citation-meta">
              <span><span class="badge source">Source</span> ${escapeHtml(item.documentVersion)} / section ${escapeHtml(item.section)} / line ${item.line}</span>
              <button type="button" class="secondary" data-source="${item.documentId}" data-line="${item.line}">Open source</button>
            </div>
            <blockquote>${escapeHtml(item.text)}</blockquote>
            <label class="verify-control">
              <input type="checkbox" data-verify="${id}" ${verified ? "checked" : ""}>
              I verified this source line
            </label>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderChanges() {
  const material = state.changes.filter((item) => item.status !== "unchanged");
  if (!material.length) return `<div class="empty-state"><div><strong>No material version changes</strong><p>The baseline and proposed document use the same tracked clauses.</p></div></div>`;
  return `
    <div class="change-list">
      ${material.map((item) => `
        <article class="change-row">
          <div class="citation-meta">
            <h3>Section ${escapeHtml(item.section)}</h3>
            <span class="badge ${item.status}">${item.status}</span>
          </div>
          <div class="comparison-columns">
            <p><strong>Baseline</strong><br>${escapeHtml(item.before || "Not present")}</p>
            <p><strong>Proposed</strong><br>${escapeHtml(item.after || "Removed")}</p>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderFields() {
  return `
    <table class="field-table">
      <caption class="sr-only">Structured fields extracted from the proposed document</caption>
      <tbody>
        ${state.fields.map((field) => `
          <tr>
            <th scope="row">${escapeHtml(field.label)}</th>
            <td>
              ${escapeHtml(field.value)}
              ${field.source ? `<br><button type="button" class="secondary" data-source="${field.source.documentId}" data-line="${field.source.line}">View section ${escapeHtml(field.source.section)}</button>` : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <h3>Review flags</h3>
    <ul class="risk-list">${state.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("")}</ul>
    <label class="review-check">
      <input id="fields-reviewed" type="checkbox" ${state.fieldsReviewed ? "checked" : ""}>
      I reviewed the extracted fields against their source sections
    </label>
  `;
}

function renderTabPanel() {
  const content = state.activeTab === "changes" ? renderChanges() : state.activeTab === "fields" ? renderFields() : renderEvidence();
  return `<section class="tab-panel" id="panel-${state.activeTab}" role="tabpanel" aria-labelledby="tab-${state.activeTab}">${content}</section>`;
}

function renderSource(packet) {
  const source = activeSource(packet);
  return `
    <aside class="source-inspector" aria-label="Source document inspector">
      <div class="inspector-heading">
        <p class="eyebrow">Source inspector</p>
        <h2>${escapeHtml(source.title)}</h2>
        <p>${escapeHtml(source.version)} / ${escapeHtml(source.type)}</p>
      </div>
      <div class="source-page" tabindex="0">
        ${source.clauses.map((clause, index) => {
          const line = index + 1;
          return `
            <p class="source-line ${line === state.selectedSourceLine ? "is-cited" : ""}" id="source-line-${line}">
              <span class="line-number">${escapeHtml(clause.section)}<br>L${line}</span>
              <span>${escapeHtml(clause.text)}</span>
            </p>
          `;
        }).join("")}
      </div>
    </aside>
  `;
}

function renderDecision() {
  const canApprove = state.analyzed && state.verified.size > 0 && state.fieldsReviewed && !state.analyzing;
  return `
    <section class="decision-panel" aria-label="Human review decision">
      <div>
        <p class="eyebrow">Human control point</p>
        <h2>Complete the evidence review</h2>
        <p>Approval unlocks after at least one citation and the structured fields are verified.</p>
        <div class="status-line" role="status">
          <span class="status-dot ${state.decision}"></span>
          ${decisionLabel()} / ${state.verified.size} citation${state.verified.size === 1 ? "" : "s"} verified / fields ${state.fieldsReviewed ? "reviewed" : "pending"}
        </div>
      </div>
      <div class="decision-actions">
        <button type="button" id="approve-review" ${canApprove ? "" : "disabled"}>Approve review</button>
        <button type="button" id="return-review" class="danger" ${state.analyzed ? "" : "disabled"}>Return for clarification</button>
      </div>
    </section>
  `;
}

function render() {
  const packet = activePacket();
  app.setAttribute("aria-busy", String(state.analyzing));
  app.innerHTML = `
    <div class="workspace-grid">
      ${renderPacketRail(packet)}
      <section class="review-surface">
        <div class="toolbar">
          <div class="toolbar-copy">
            <p class="eyebrow">${escapeHtml(packet.reference)} / ${escapeHtml(packet.owner)}</p>
            <h2>${escapeHtml(packet.title)}</h2>
            <p>${escapeHtml(packet.summary)}</p>
          </div>
          <div class="toolbar-actions">
            <button type="button" class="secondary" id="copy-summary" ${state.analyzed ? "" : "disabled"}>Copy summary</button>
            <button type="button" class="secondary" id="download-summary" ${state.analyzed ? "" : "disabled"}>Download summary</button>
          </div>
        </div>

        <section class="question-panel" aria-label="Evidence question">
          <label for="review-question">Question or review focus</label>
          <div class="question-actions">
            <input id="review-question" type="search" value="${escapeHtml(state.query)}" autocomplete="off" aria-describedby="question-help question-error">
            <button type="button" id="analyze-packet" ${state.analyzing ? "disabled" : ""}>Analyze evidence</button>
          </div>
          <p id="question-help" class="sr-only">Ask about obligations, approval, response time, fees, notice, data scope, or term.</p>
          <p id="question-error" class="validation-message">${escapeHtml(state.validation)}</p>
        </section>

        <div class="review-grid">
          <section class="analysis-panel" aria-label="Analysis results">
            ${renderTabs()}
            ${renderTabPanel()}
          </section>
          ${renderSource(packet)}
        </div>
        ${renderDecision()}
      </section>
    </div>
  `;
  bindEvents(packet);
}

function runAnalysis(packet) {
  const input = document.querySelector("#review-question");
  const query = input.value.trim();
  state.query = query;
  if (query.length < 3) {
    state.validation = "Enter at least three characters so the evidence search has a clear focus.";
    render();
    document.querySelector("#review-question").focus();
    return;
  }

  state.validation = "";
  state.analyzing = true;
  state.activeTab = "evidence";
  render();
  window.setTimeout(() => {
    state.results = rankLines(packet, query);
    state.analyzed = true;
    state.analyzing = false;
    state.verified = new Set();
    state.fieldsReviewed = false;
    state.decision = "pending";
    if (state.results.length) {
      state.selectedSourceId = state.results[0].documentId;
      state.selectedSourceLine = state.results[0].line;
    }
    addHistory(`Evidence analysis completed for: ${query}`);
    render();
  }, 420);
}

function reviewSummary(packet) {
  return buildReviewSummary({
    packet,
    query: state.query,
    results: state.results,
    verifiedIds: [...state.verified],
    fields: state.fields,
    changes: state.changes,
    fieldsReviewed: state.fieldsReviewed,
    decision: decisionLabel()
  });
}

async function copySummary(packet) {
  try {
    await navigator.clipboard.writeText(reviewSummary(packet));
    addHistory("Review summary copied to clipboard.");
  } catch {
    addHistory("Clipboard access was unavailable; use Download summary instead.");
  }
  render();
}

function downloadSummary(packet) {
  const blob = new Blob([reviewSummary(packet)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${packet.reference.toLowerCase()}-doctrace-review.txt`;
  link.click();
  URL.revokeObjectURL(url);
  addHistory("Review summary downloaded as a local text file.");
  render();
}

function bindEvents(packet) {
  document.querySelectorAll("[data-packet]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePacketId = button.dataset.packet;
      resetReview(activePacket(), "A new synthetic packet was opened for review.");
      render();
    });
  });

  document.querySelector("#analyze-packet").addEventListener("click", () => runAnalysis(packet));
  document.querySelector("#review-question").addEventListener("keydown", (event) => {
    if (event.key === "Enter") runAnalysis(packet);
  });
  document.querySelector("#review-question").addEventListener("input", (event) => {
    state.query = event.target.value;
  });

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      render();
      document.querySelector(`#tab-${state.activeTab}`).focus();
    });
  });

  document.querySelectorAll("[data-source]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSourceId = button.dataset.source;
      state.selectedSourceLine = Number(button.dataset.line || 0);
      render();
      document.querySelector(".source-inspector").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  document.querySelectorAll("[data-verify]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.verified.add(checkbox.dataset.verify);
        addHistory(`Citation ${checkbox.dataset.verify} verified by reviewer.`);
      } else {
        state.verified.delete(checkbox.dataset.verify);
        addHistory(`Citation ${checkbox.dataset.verify} verification removed.`);
      }
      state.decision = "pending";
      render();
    });
  });

  const fieldsReviewed = document.querySelector("#fields-reviewed");
  if (fieldsReviewed) {
    fieldsReviewed.addEventListener("change", () => {
      state.fieldsReviewed = fieldsReviewed.checked;
      state.decision = "pending";
      addHistory(state.fieldsReviewed ? "Structured fields verified against source sections." : "Structured field verification reopened.");
      render();
    });
  }

  document.querySelector("#approve-review").addEventListener("click", () => {
    state.decision = "approved";
    addHistory("Review packet approved by human reviewer.");
    render();
  });
  document.querySelector("#return-review").addEventListener("click", () => {
    state.decision = "returned";
    addHistory("Review packet returned for clarification by human reviewer.");
    render();
  });
  document.querySelector("#copy-summary").addEventListener("click", () => copySummary(packet));
  document.querySelector("#download-summary").addEventListener("click", () => downloadSummary(packet));
}

function renderLoadError(message) {
  app.removeAttribute("aria-busy");
  app.innerHTML = `
    <section class="startup-state error-state" role="alert">
      <p class="eyebrow">Document data unavailable</p>
      <h2>The synthetic review packets could not be loaded.</h2>
      <p>${escapeHtml(message)}</p>
      <p>Use a local static server or the deployed GitHub Pages site so the browser can read the JSON fixture.</p>
      <button type="button" id="retry-load">Retry</button>
    </section>
  `;
  document.querySelector("#retry-load").addEventListener("click", loadPackets);
}

async function loadPackets() {
  app.setAttribute("aria-busy", "true");
  try {
    const response = await fetch("data/packets.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Packet request returned ${response.status}.`);
    const data = await response.json();
    if (!Array.isArray(data.packets) || !data.packets.length) throw new Error("Packet data was empty.");
    state.packets = data.packets;
    state.activePacketId = data.packets[0].id;
    resetReview(data.packets[0]);
    app.removeAttribute("aria-busy");
    render();
  } catch (error) {
    renderLoadError(error instanceof Error ? error.message : "Unknown loading error.");
  }
}

loadPackets();
