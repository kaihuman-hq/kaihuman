---
name: mobile-orchestrator
description: >-
  Autonomous multi-phase orchestrator for building the kaihuman native iOS and Android app
  (Option B: Expo + React Native + SwiftUI WidgetKit + Android Jetpack Glance) according to
  doc/mobile.md and doc/mobile-plan.md. Activate this skill when the user asks to implement,
  build, or continue the mobile app or its phases.
---

# kaihuman Mobile Autonomous Orchestrator

Use this skill to execute [`doc/mobile-plan.md`](../../../doc/mobile-plan.md) completely autonomously using fresh-context subagents in Antigravity IDE.

## 1. Orchestration Protocol (Empty Context per Phase)

1. **Read Status First:** Read [`doc/mobile-plan.md`](../../../doc/mobile-plan.md) to see which phases/tasks are still unchecked (`- [ ]`).
2. **Never Do All Phases in One Context Window:** You are the **Orchestrator**. For each uncompleted phase (Phase 1 through Phase 5), spawn a dedicated worker subagent using `invoke_subagent` with:
   - `TypeName: "self"`
   - `Model: "inherit"`
   - `Role`: `"Mobile Phase <N> Implementer"`
   - `Prompt`: Provide the exact phase instructions below so the subagent starts with a clean context window, reads only [`doc/mobile.md`](../../../doc/mobile.md) and [`doc/mobile-plan.md`](../../../doc/mobile-plan.md), implements the phase, runs verification, ticks the checkboxes in `doc/mobile-plan.md`, updates `doc/progress.md`, and reports back.
3. **Zero Questions Policy:** Do not stop to ask the user design questions. Resolve every detail using [`doc/mobile.md`](../../../doc/mobile.md), [`CLAUDE.md`](../../../CLAUDE.md), and existing patterns in `packages/formats`, `packages/core`, and `apps/console`.
4. **Sequential Verification Gate:** Wait for the Phase `N` subagent to complete and verify that `pnpm run check` and `pnpm -r test` pass before invoking the Phase `N+1` subagent.

---

## 2. Subagent Prompt Template

When calling `invoke_subagent` for Phase `N`, use this prompt structure:

```text
You are implementing Phase <N> of the kaihuman Mobile App (Option B: Expo + React Native + iOS WidgetKit + Android Glance).

1. Read `CLAUDE.md`, `doc/mobile.md`, and Phase <N> of `doc/mobile-plan.md`.
2. Implement all files and tests listed in Phase <N> of `doc/mobile-plan.md`.
   - Follow all repository rules: ESM (`"type": "module"`), `.js` extensions on relative imports, strict TypeScript, zero Biome lint/format warnings.
   - Make zero breaking changes to `apps/console` or other workspace packages.
3. Run verification:
   - `pnpm run fix`
   - `pnpm run build`
   - `pnpm run check`
   - `pnpm -r test`
4. Tick `[x]` on the completed steps in `doc/mobile-plan.md` and add a dated entry at the top of `doc/progress.md`.
5. Return a concise summary of the files created/modified and the test results.
```

