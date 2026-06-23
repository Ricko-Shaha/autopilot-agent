# Moonshot Hackathon submission packet — Autopilot Agent

**Hackathon:** Moonshot ("Moonshots Only — Zero to one ideas") · **Deadline:** 2026-06-30 17:00 IST
**Same codebase as the Qwen build** ([README.md](README.md)) — but Moonshot is open-stack,
so **no Qwen/Alibaba Cloud requirement**: it runs on the offline mock, or any tool-calling
model you point `LLM_PROVIDER` at. Originality and technical ambition are judged above all,
so this writeup leads with the *idea*, not the plumbing.

> Moonshot's rules require a significant original contribution and credit for any external
> work. This project is original work built for this submission; it depends only on the
> Node.js standard library (no third-party frameworks). Credit any model/provider you wire
> in (e.g. Qwen) in your final description.

---

## The zero-to-one idea: **trust-calibrated autonomy**

Today's agents sit at two useless extremes: "suggest-only" copilots that don't actually
*do* anything, or "full-auto" agents you can't trust near anything that matters. Neither
ships in a real business.

**Autopilot proposes a third model: an agent that runs a workflow with full autonomy up to
a declared *trust boundary*, then defers to a human — and resumes autonomously after the
decision.** Autonomy isn't a global on/off switch; it's a *per-action property*. A tool is
either reversible (the agent just does it) or irreversible/consequential (it crosses the
boundary and requires human sign-off). The boundary is declarative — one flag per tool —
so the same engine is safe in any domain without rewriting the agent.

That reframing is the contribution. The implementation proves it works end to end with a
full audit trail, and demonstrates that the boundary holds: when a human rejects, the
irreversible action provably never executes, yet the workflow still completes and records
the decision.

## Why it's a moonshot, not a redesign

- It's not "a chatbot with buttons." The autonomy/checkpoint split is enforced in the agent
  loop itself, model-agnostically — a reusable safety primitive, not a UI feature.
- It generalizes: swap the tool set and the *same* trust-calibrated engine runs sales,
  support, ops remediation, finance approvals. The idea scales past the demo.
- The ambition: make autonomous agents deployable in places they're currently banned —
  anywhere an action is irreversible — by making "where humans must intervene" a
  first-class, auditable part of the system.

## What to show in the ~3-min video

Same flow as [SUBMISSION.md](SUBMISSION.md) §2, but frame the narration around the idea:
"autonomy as a per-action property." The pivotal beat is the **reject** path — prove the
boundary holds: the customer email is never sent, yet the agent finishes gracefully and
logs why. Close on the architecture diagram + `npm test` (the boundary is unit-tested).

## Run it (no keys, no cloud)

```bash
npm run demo            # full trace, offline
APPROVE=reject npm run demo   # prove the trust boundary holds
npm test                # 5 passing tests, incl. the boundary guarantee
npm run serve           # web UI with the live checkpoint
```

## Submission checklist (Moonshot)

- [ ] Public repo with this code + an open-source LICENSE (MIT included).
- [ ] ~3-min video (idea-first framing above), uploaded public.
- [ ] Text description leading with "trust-calibrated autonomy" + crediting any model used.
- [ ] Submit on the Moonshot Devpost before 2026-06-30 17:00 IST.
- [ ] (No cloud-deploy requirement for this one — simplest of the four to ship.)
