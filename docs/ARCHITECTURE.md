# Health Response Agent — Architecture

This document describes how the **Health Response Agent** is put together: the
target AWS architecture, the current MVP implementation, the agent state
machine, and the request / consent / escalation flow.

> The agent is **action-oriented**, not a chatbot. It maintains context, screens
> for emergencies, calls a clinical triage service (the **source of truth** for
> the response level), produces a structured handoff, requests consent before
> sensitive actions, executes permitted actions, and monitors their status.

GitHub renders the Mermaid diagrams below inline.

---

## 1. AWS architecture (target)

```mermaid
flowchart TD
  UI["User Interface<br/>(SPA / Next.js)"] --> GW["Amazon API Gateway<br/>(+ WAF, rate limiting)"]
  GW --> ORCH["Agent Orchestrator<br/>(AWS Lambda)"]
  ORCH --> BR["Amazon Bedrock<br/>understanding · structured output<br/>tool selection · summaries"]
  ORCH --> TOOLS["Approved Agent Tools<br/>(Lambda handlers)"]

  TOOLS --> TRIAGE["Clinical Triage Endpoint<br/>SOURCE OF TRUTH for the level"]
  TOOLS --> SCR["Emergency Screening"]
  TOOLS --> PROV["Provider / Booking Endpoint"]
  TOOLS --> EMG["Emergency Response Endpoint"]
  TOOLS --> LOC["Amazon Location Service<br/>emergency numbers / geocoding"]

  ORCH --> DDB["Amazon DynamoDB<br/>session · consent · audit events"]
  ORCH --> CW["Amazon CloudWatch / AWS X-Ray"]

  VOICE["Amazon Transcribe / Amazon Polly"] --> UI
  SEC["AWS KMS · Secrets Manager · Cognito · IAM (least privilege)"] --- ORCH

  classDef truth fill:#fff0f1,stroke:#c83d46,color:#102a43;
  classDef aws fill:#e8fbf9,stroke:#0a8f89,color:#102a43;
  class TRIAGE truth;
  class BR,LOC,DDB,CW,VOICE,GW aws;
```

**Bedrock** understands input, manages the conversation, extracts structured
information, selects approved tools, and generates user-friendly explanations and
the factual handoff. It is **not** a clinically validated triage system — the
**triage endpoint** returns the validated level, recommended action, warning
signs, timeframe, and whether escalation is required.

---

## 2. Current MVP implementation

The repository ships a zero-runtime-dependency implementation that mirrors the
target architecture, so it runs offline and ports cleanly to AWS later.

```mermaid
flowchart LR
  subgraph Client["Browser SPA (src/client)"]
    STORE["Reactive store<br/>state + chat log"]
    CHAT["Chat / screens<br/>components"]
    APIC["Typed API client<br/>(api.ts)"]
    STORE --- CHAT
    CHAT --> APIC
  end

  subgraph Server["Node http server (src/server)"]
    ROUTER["Router + routes<br/>/api/*"]
    ORCH["Agent orchestrator<br/>(src/agent)"]
    TOOLS["Tool registry<br/>(restricted)"]
  end

  subgraph Services["Service adapters (src/services)"]
    direction TB
    TRI["triage (SOURCE OF TRUTH)"]
    SCR["emergency-screening"]
    NUM["emergency-numbers"]
    PROV["provider-contact"]
    ESC["escalation"]
    SUM["summary"]
    AUD["audit"]
  end

  APIC -->|"HTTP + Zod-style validation"| ROUTER
  ROUTER --> ORCH
  ORCH --> TOOLS
  TOOLS --> TRI & SCR & NUM & PROV & ESC & SUM & AUD

  TRI -. "SERVICE_MODE=auto + endpoint" .-> REAL["Real clinical endpoint"]
  TRI -. "default: mock" .-> MOCK["Deterministic mock"]

  classDef truth fill:#fff0f1,stroke:#c83d46,color:#102a43;
  class TRI truth;
```

Each service has a shared interface plus **mock** and **real** implementations,
selected by configuration (`SERVICE_MODE` + endpoint env vars). Every payload is
validated by a dependency-free schema validator (`src/shared/schema.ts`).

---

## 3. Agent state machine

The orchestrator only moves between a fixed set of states through a **guarded
transition map** — invalid transitions are rejected. This is what makes it a
controlled agent rather than an ad-hoc chatbot.

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> collecting_context
  collecting_context --> screening_for_emergency
  screening_for_emergency --> asking_follow_up
  screening_for_emergency --> presenting_level_3: emergency signals
  asking_follow_up --> awaiting_user_response
  awaiting_user_response --> screening_for_emergency
  awaiting_user_response --> submitting_triage
  submitting_triage --> triage_complete
  submitting_triage --> failed
  triage_complete --> presenting_level_1
  triage_complete --> presenting_level_2
  triage_complete --> presenting_level_3

  presenting_level_2 --> awaiting_consent
  presenting_level_3 --> awaiting_consent
  awaiting_consent --> executing_action
  executing_action --> monitoring_action
  monitoring_action --> completed
  executing_action --> failed
  failed --> fallback_required

  presenting_level_1 --> completed
  monitoring_action --> monitoring_action: poll status

  note right of presenting_level_3
    Emergency interruption can jump here
    from any routine state, preserving
    collected information.
  end note

  note right of awaiting_consent
    No sensitive action runs before
    explicit consent is recorded.
  end note
```

Key guarantees enforced by the machine:

- An action cannot execute before **consent** (`awaiting_consent → executing_action`).
- Emergency signals **interrupt** the questionnaire and route straight to Level 3.
- After a confirmed Level 3 escalation the agent does **not** silently return to
  routine questions.
- Any safety-critical failure routes to `fallback_required`.

---

## 4. Request / consent / escalation flow (Level 3)

```mermaid
sequenceDiagram
  actor U as User
  participant C as Chat UI
  participant A as Agent Orchestrator
  participant S as Emergency Screening
  participant T as Clinical Triage (truth)
  participant N as Emergency Numbers
  participant E as Escalation Service

  U->>C: "sudden chest pressure, can't breathe…"
  C->>A: POST /api/agent/message
  A->>S: emergency_screening
  S-->>A: possibleEmergency = true
  A->>T: submit_triage
  T-->>A: level 3, escalationRequired
  A->>N: get_emergency_number(country)
  N-->>A: verified number (never invented)
  A-->>C: Level 3 card + emergency number
  U->>C: grants health + location consent
  C->>E: POST /api/escalate (consent + idempotencyKey)
  E-->>C: status = simulated / pending (labelled SIMULATED)
  loop monitor
    C->>E: GET /api/escalate/{ref}/status
    E-->>C: pending → received → acknowledged
  end
```

**Safety rules in this flow:** consent is required and recorded before sharing;
the emergency number comes only from a verified source; the escalation is
idempotent (no duplicate alerts) and **never auto-retried**; simulated actions
are always labelled and never presented as real.

---

## Related

- Product overview, tools, install and demo script: [README.md](../README.md)
- Endpoint paths (single source): `src/shared/constants.ts` → `API_ROUTES`
- Agent state machine: `src/agent/state-machine.ts`
- Tool registry: `src/agent/tools.ts`
