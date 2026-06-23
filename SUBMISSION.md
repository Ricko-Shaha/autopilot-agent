# Devpost submission packet — Autopilot Agent

**Hackathon:** Global AI Hackathon with Qwen Cloud · **Track 4: Autopilot Agent**
**Deadline:** 2026-07-09 14:00 PDT

---

## 1. Text description (paste into Devpost "What it does" / description)

**Autopilot Agent — autonomous business workflows with a human in the loop.**

Operations teams spend their days on repetitive, multi-step requests: pricing a quote,
triaging a ticket, responding to an alert. Autopilot reads an inbound request in plain
language and drives the entire workflow to completion — gathering facts through tools,
reasoning over ambiguous input, and acting — **but it pauses at a human approval
checkpoint before any irreversible or customer-facing action.** You get automation speed
with human oversight, plus a complete audit trail of every decision.

The bundled demo handles a **sales inquiry → quote** workflow end to end: it parses a
free-text email, looks up catalog SKUs, computes a tier- and volume-discounted quote,
verifies stock, drafts the reply, **waits for you to approve or edit the email**, sends
it only on approval, and logs the opportunity to CRM. Because the agent only sees tool
*schemas*, the same engine retargets to support triage, alert remediation, or onboarding
just by swapping tools.

**Built on Qwen.** The agent's reasoning and native tool-calling run on Qwen models via
Qwen Cloud's OpenAI-compatible API; the service is a single zero-dependency Node process
deployed on Alibaba Cloud. A provider abstraction means Qwen powers production while a
deterministic mock powers offline tests — so the orchestration, tool wiring, approval
gate, and audit trail are all verifiable without spending a token.

**Why it fits Track 4:** ambiguous natural-language input ✓, external tool invocation ✓,
human-in-the-loop checkpoints at critical decisions ✓, production-readiness (typed core,
audit trail, tests, containerized deploy) over a toy demo ✓.

**Built with:** Qwen Cloud · TypeScript · Node 22 · Server-Sent Events · zero runtime deps.

---

## 2. Demo video script (~3 minutes)

> Record your screen with the app running **on your Alibaba Cloud URL** so this doubles
> toward the deployment proof. Keep it tight.

- **0:00–0:20 — Hook.** "Ops teams answer the same multi-step requests all day. Autopilot
  does the whole workflow — but checks with a human before it does anything irreversible."
  Show the web UI with the inbound inquiry on the left.
- **0:20–0:45 — The request.** Read the inbound email aloud. Click **Run Autopilot**.
- **0:45–1:40 — Live reasoning.** Narrate the trace as it streams: reads the request →
  `lookup_catalog` → `compute_quote` (call out the tier/volume discount and stock check)
  → `draft_reply`. Emphasize: "every step is tool-grounded and audited — no hallucinated
  data."
- **1:40–2:20 — The checkpoint (the star).** The approval card appears. Edit one line of
  the draft to show human control. Click **Approve & send** → show it sends + logs to CRM.
  Then say: "Watch what happens if I *reject*…" — re-run, click **Reject**: the email is
  **never sent**, but the workflow still finishes and logs the decision.
- **2:20–2:45 — Under the hood.** Cut to the architecture diagram + `src/llm/qwen.ts`:
  "Reasoning runs on Qwen Cloud; the backend runs on Alibaba Cloud ECS." Show the URL bar.
- **2:45–3:00 — Close.** "Provider-agnostic core, full audit trail, passing tests, swap
  the tools for any workflow. That's Autopilot." Show `npm test` green.

---

## 3. Submission checklist (what YOU do — needs your accounts)

- [ ] Register on **Devpost** and join the Qwen hackathon.
- [ ] Get **Qwen Cloud** free credits via the voucher form; create an API key.
- [ ] Push this folder to a **public GitHub repo** (MIT `LICENSE` is included and shows in
      the About box — required).
- [ ] **Deploy on Alibaba Cloud** (see [DEPLOY.md](DEPLOY.md)) and record the short
      **proof-of-deployment** clip (URL bar showing the Alibaba IP/host).
- [ ] Record the **~3-min demo video**, upload to YouTube/Vimeo **public**.
- [ ] In the repo, the **architecture diagram** is in [README.md](README.md) (Mermaid) —
      optionally export it to PNG and add to the submission.
- [ ] On Devpost: paste the description (§1), select **Track 4**, add repo URL, demo video
      URL, deployment-proof link (link `src/llm/qwen.ts` in the repo).
- [ ] *(Optional, extra prize)* Write a short build blog/social post for the Blog Post Award.

## 4. What's already done (by the build)

- ✅ Full working agent: loop, tools, human-in-the-loop approval, audit trail.
- ✅ Qwen Cloud provider (OpenAI-compatible, fetch-only) + offline mock.
- ✅ Web UI with live SSE trace + interactive Approve/Reject.
- ✅ 5 unit tests + 1 HTTP/SSE integration test, all passing.
- ✅ Dockerfile + Alibaba Cloud deploy guide + README + architecture diagram + this packet.
