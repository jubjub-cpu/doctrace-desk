# Case Study: DocuTrace Desk

## Outcome

DocuTrace turns a fictional multi-document renewal packet into a reviewable evidence trail. A user can ask a focused question, inspect exact source lines, compare changed clauses, verify extracted fields, and record a human decision without a paid API or private document upload.

## Problem

Procurement and operations reviewers often work across an agreement, a proposed amendment, and internal handoff notes. Manual summaries can separate a finding from its source and make a second review harder.

## Target User

A procurement operations reviewer checking whether a fictional vendor renewal is ready for an internal decision.

## Existing Workflow

1. Open several documents.
2. Search manually for approval, response-time, fee, notice, and data terms.
3. Compare old and proposed language.
4. Copy findings into a review note.
5. Ask another person to confirm the evidence.

The loss is not measured as a time-savings claim. The concrete quality problem is source traceability: a copied sentence may no longer show which document, section, or version supports it.

## Product Hypothesis

A local evidence workspace can make deterministic document analysis useful when it exposes the source, refuses unsupported answers, and keeps the final decision with a reviewer.

## Implemented Workflow

- Two fictional packets with baseline, proposed, and supporting documents
- Focused query with deterministic lexical retrieval
- Draft answer composed only from returned source lines
- Exact document, section, version, and line citations
- Clause-level version comparison
- Structured extraction for seven review fields
- Risk flags tied to material clause changes
- Citation and field verification gates
- Human approve or return decision
- Local text export with evidence and limitations

## Responsible AI Design

The interface labels the analysis as deterministic and local. It does not show invented confidence percentages. A no-match query returns an empty state instead of fabricated prose. Approval requires source verification, and the output states that it is not legal advice.

## Technical Approach

The product is dependency-free static HTML, CSS, and JavaScript. The analysis module is made of pure functions that run in both the browser and Node.js tests. Synthetic fixtures use stable clause identifiers so version changes can be categorized transparently.

## Accessibility and Privacy

The workflow uses semantic controls, visible focus, a skip link, status announcements, checkboxes, and responsive layouts. The data is fictional, processing stays in the browser, and no keys or external requests are required.

## Validation

Release validation covers retrieval ranking, empty results, structured extraction, version comparison, risk flags, exported evidence, required files, synthetic-data notices, private-information patterns, common secret patterns, desktop and mobile workflows, keyboard navigation, and the deployed HTTP response.

## Honest Limitations

The lexical retriever is intentionally small and cannot understand every paraphrase. It does not parse arbitrary PDFs, persist verified reviews, authenticate reviewers, or replace legal and procurement expertise.

## Portfolio Signal

DocuTrace adds evidence-first document intelligence, explainable retrieval, structured output, version comparison, local-first architecture, explicit failure states, and formal human verification. These capabilities are distinct from SignalOps incident classification and dispatch review.
