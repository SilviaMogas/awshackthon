---
inclusion: always
---

# Health Response Agent — Brand Guide

Brand context for any UI, deck, diagram, or marketing surface generated for
this product. Apply these rules whenever creating or editing visual output
(React components, HTML, SVG diagrams, slides, docs) unless a specific
design task overrides them explicitly.

## Product framing

"Health Response Agent" is an **action-oriented AI health triage agent**,
not a chatbot. Never present it as a conversational assistant, diagnostic
tool, or medical device. It maintains context, screens for emergencies,
calls a clinical triage service (the **source of truth** for the response
level), produces a structured medical handoff, requests consent before
sensitive actions, executes permitted actions, and monitors their status.

Three response levels — use these labels and colors consistently:

| Level | Meaning | Color |
|---|---|---|
| L1 | Self-care guidance | Success green `#18794E` |
| L2 | Medical attention within 24h | Amber `#8A5200` |
| L3 | Urgent emergency escalation | Alert red `#C83D46` |

Amazon Bedrock (or any LLM) is **never** the clinical decision system — the
triage endpoint is. Any architecture diagram or copy must make this
distinction explicit.

## Color palette

| Token | Hex | Use |
|---|---|---|
| Navy (primary) | `#071B2E` | Dark backgrounds, primary text, wordmark |
| Cyan (accent) | `#25D0C8` | Primary accent, links, active states |
| Soft cyan | `#A8F2ED` | Highlights on dark backgrounds, secondary text on navy |
| Teal | `#0A8F89` | Borders, connectors, AWS-managed-service accents |
| Light background | `#F5F8FA` | Page/slide background |
| Text | `#102A43` | Body text on light backgrounds |
| Success (L1) | `#18794E` | Positive states, L1 |
| Amber (L2) | `#8A5200` | Caution states, L2 |
| Alert (L3) | `#C83D46` | Errors, L3, the clinical "source of truth" node |

Never substitute a generic blue — this palette is the only approved set.
Dark navy dominates on cover/section slides; light background dominates on
content slides ("sandwich" structure, matching the existing pitch deck).

## Typography

Font: **Inter** (fallback: Arial / system sans-serif). Bold (700–750) for
headlines and the wordmark; regular/medium for body copy. Do not substitute
a serif or a default AI-generated font.

## Logo

Source of truth: `src/client/public/logo.svg`.

- Full wordmark (circular signal + "Health Response Agent" text) — use on
  cover slides, closing slides, and anywhere the brand is introduced.
- Icon-only mark (the circular signal alone, see `image3.svg`-style crop:
  navy circle, cyan ring, soft-cyan center dot) — use as a small footer/favicon
  mark wherever the full wordmark would be too large (slide footers,
  browser tab icons, avatars).
- Always render on navy or light backgrounds per the palette above. Never
  recolor the mark outside these tokens, never stretch or distort the
  aspect ratio.

## Architecture diagrams

When diagramming the system (see `docs/ARCHITECTURE.md` for the canonical
version):

- Left-to-right flow: User Interface → API Gateway → Agent Orchestrator
  (Lambda) → Bedrock (understanding/tooling, clearly labeled "not a
  clinical decision system") + Approved Agent Tools → downstream services
  → DynamoDB / CloudWatch, with a security band (KMS, Secrets Manager,
  Cognito, IAM) cross-cutting underneath.
- The **Clinical Triage Endpoint** node is always visually distinct —
  red/accent outline (`#C83D46`) with a "SOURCE OF TRUTH" label — never the
  same style as other tool nodes.
- Include the note: "Agent decides which tool to call — the triage endpoint
  decides the clinical level."
- Rounded nodes, subtle shadows, generous spacing, high contrast, 16:9-safe.

## Voice and safety copy

- Action-oriented, plain language, no false certainty. Avoid words like
  "diagnose" or "chatbot."
- Any simulated/demo action (e.g. emergency escalation in a non-production
  build) must be labeled "simulated" and never presented as real.
- Consent, auditability, and human override are product requirements, not
  footnotes — surface them in copy near any action-taking UI.
