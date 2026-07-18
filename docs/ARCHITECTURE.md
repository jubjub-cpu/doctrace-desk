# Architecture

## System Boundary

DocuTrace Desk is a static, local-first browser application. The deployed recruiter workflow has no server-side code, database, authentication, telemetry, or external AI request.

```text
Synthetic packet JSON
        |
        v
Pure analysis functions
  - tokenize and expand query
  - rank cited source lines
  - extract structured fields
  - compare clause versions
  - generate risk flags
        |
        v
Browser review state
  - selected packet and source
  - verified citations
  - field-review status
  - human decision
        |
        v
Rendered evidence workspace and local text export
```

## Components

### `data/packets.json`

Contains two fictional review packets. Each document has a stable role, version, clause section, and ordered source lines. Every packet includes explicit synthetic-data notices.

### `assets/analysis.mjs`

Contains pure, deterministic functions. The browser and the Node.js tests use the same module, which keeps release evidence tied to shipped logic.

Retrieval expands a small transparent term set, scores overlap, favors current documents slightly, and returns exact document, section, and line metadata. It does not claim semantic equivalence or model confidence.

### `assets/app.js`

Owns transient in-browser state and renders the work surface. It enforces the human gate: approval requires an analyzed question, one verified citation, and structured-field confirmation.

### Export

The export function builds a plain-text summary with verified evidence, extracted fields, material changes, decision state, and the legal-advice limitation. The file is created and downloaded locally with a browser Blob.

## Trust Model

- Synthetic fixture content is treated as trusted repository data.
- User-entered search text is escaped before it is rendered.
- No user content is sent to a network endpoint.
- AI-style findings remain drafts until a human verifies evidence.
- The product does not authenticate reviewer identity, so its audit history is demonstrative rather than authoritative.

## Failure States

- JSON load failure shows a retryable error and local-server guidance.
- Questions shorter than three characters show inline validation.
- Unmatched questions show a no-evidence result rather than generated filler.
- Clipboard failure is recorded and the download path remains available.
- Approval remains disabled until the required review evidence is present.
