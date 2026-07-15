# ReAct Event State Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make ReAct streaming events typed, correlated, ordered, and terminal-state safe without changing model decision behavior.

**Architecture:** Add a shared server event protocol and typed Sink writer, keep legacy event names as compatibility fields, make `reactChat` own run/round terminal state, and move client event handling into a reducer keyed by `callId`.

**Tech Stack:** TypeScript, React 18, SSE, Electron IPC, Vitest.

---

### Task 1: Add the event protocol and typed Sink writer

**Files:**
- Create: `server/services/reactEvents.ts`
- Modify: `server/services/sink.ts`
- Test: `server/__tests__/sink.test.ts`

- [x] Define `ReactRunState`, `ReactEvent`, `ReactToolCallEvent`, and `ReactTerminalEvent` with `runId`, sequence, round, and call identifiers.
- [x] Add `Sink.writeEvent(event)` with a default-compatible implementation that serializes through `write`.
- [x] Keep existing `write(string)` for adapters and non-ReAct callers.
- [x] Test serialization and terminal event shape.

### Task 2: Make `reactChat` terminal-safe and order-preserving

**Files:**
- Modify: `server/services/reactLoopCore.ts`
- Modify: `server/services/toolRoundEngine.ts` only for typed event emission hooks
- Test: `server/__tests__/reactLoopCore.test.ts`

- [x] Generate one `runId` per invocation and emit run/round events.
- [x] Emit `run_failed` on configuration or round errors and `run_cancelled` on abort; never emit completion after a terminal event.
- [x] Give every tool call a stable `callId` from the provider ID or a deterministic fallback.
- [x] Replace shared `toolMessages.push` inside `Promise.all` with indexed results so context writeback preserves call order.
- [x] Emit retrying and final tool events with explicit status while retaining legacy fields for the client adapter.
- [x] Add tests for API failure, cancellation, terminal uniqueness, same-name parallel calls, and message order.

### Task 3: Add client event reducer and callId correlation

**Files:**
- Create: `client/src/features/chat/hooks/useReactEventReducer.ts`
- Modify: `client/src/types/index.ts`
- Modify: `client/src/services/api/_base.ts`
- Modify: `client/src/features/chat/components/ChatArea.tsx`
- Modify: `client/src/features/chat/components/ReActStep.tsx`
- Test: `client/src/features/chat/hooks/useReactEventReducer.test.ts`

- [x] Extend client event types with run/round/call IDs and terminal statuses.
- [x] Parse new events while mapping legacy events to the same reducer actions.
- [x] Update tool segments by `callId`, never by `toolName` when the ID is available.
- [x] Ignore events after a terminal state and expose cancelled/failed state to ChatArea.
- [x] Keep existing callback API working during migration.

### Task 4: Verify cross-runtime behavior and document completion

**Files:**
- Modify: `docs/changes/2026-07-15-react-event-state-model/exec-plan.md`
- Modify: `docs/changes/2026-07-15-react-event-state-model/traceability.md`

- [x] Run focused server tests and the client production build.
- [x] Run `npm test`, `npm run build`, and `npm run build:bundle -w mint-server`.
- [x] Run Prettier and `git diff --check`.
- [x] Record final test counts and known non-blocking warnings.
