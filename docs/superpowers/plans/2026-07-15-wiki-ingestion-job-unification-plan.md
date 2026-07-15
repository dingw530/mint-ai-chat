# Wiki Ingestion Job Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify Web and Electron Wiki upload jobs behind one validation, archive, JobStore, and ingestion orchestration path without changing compiler or graph semantics.

**Architecture:** Add shared upload contracts and a `WikiIngestionJobService` in `server/services/api/`. Keep `ingestWikiSource` as the domain ingestion executor. Express and Electron become thin adapters that provide dependencies and map the shared job/result contract to HTTP or IPC.

**Tech Stack:** TypeScript, Node.js, Express, Electron CommonJS bridge, Vitest, existing in-process Map JobStore.

---

### Task 1: Establish shared upload and job contracts

**Files:**
- Create: `server/services/api/wikiIngestionTypes.ts`
- Modify: `server/services/utils/jobStore.ts`
- Test: `server/__tests__/jobStore.test.ts`

- [x] Add `WikiUploadInput`, `WikiJob`, `WikiJobStatus`, `WikiJobResult`, and `WikiJobUpdate` types. Include optional `graphErrors` in the result.
- [x] Move the existing `UploadJob` shape in `jobStore.ts` to import/re-export the shared types while preserving existing function names and return shapes.
- [x] Keep `createJob`, `updateJob`, and `getJob` as the only JobStore mutation/read API; do not expose the internal Map.
- [x] Add a test that verifies `graphErrors` survives `updateJob` and that `updatedAt` changes on update.
- [x] Run `cd server && npx vitest run __tests__/jobStore.test.ts` and confirm it passes.

### Task 2: Extract shared file validation and archive operations

**Files:**
- Create: `server/services/api/wikiFileService.ts`
- Modify: `server/services/api/wikiIngestionService.ts`
- Test: `server/__tests__/wikiFileService.test.ts`

- [x] Implement `validateWikiUpload(settings, input)` using `isSupportedFile` and `settings.wikiMaxFileSize`; throw errors with the existing Chinese messages used by the HTTP route.
- [x] Implement `archiveWikiUpload(wikiPath, input)` by reusing `archiveWikiRawFile`, returning the normalized relative source path and byte size.
- [x] Implement `readArchivedWikiFile(wikiPath, relativePath)` with path resolution under the configured Wiki root.
- [x] Re-export `buildWikiSourceText` from the shared service or keep the existing ingestion export stable; do not duplicate source formatting.
- [x] Add tests for unsupported extension, max-size rejection, duplicate filename suffixing, date-prefix normalization, and archive path normalization.
- [x] Run `cd server && npx vitest run __tests__/wikiFileService.test.ts __tests__/wikiIngestionService.test.ts`.

### Task 3: Implement the shared ingestion Job service

**Files:**
- Create: `server/services/api/wikiIngestionJobService.ts`
- Modify: `server/services/api/wikiIngestionService.ts` only if a shared helper export is needed
- Test: `server/__tests__/wikiIngestionJobService.test.ts`

- [x] Define a dependency object containing settings provider, `parseFile`, `ingestWikiSource`, and JobStore functions so the service is unit-testable without Electron or Express.
- [x] Implement `start(input)` to validate and archive synchronously, create a Job, return `{ jobId, sourceFile, fileName, fileSize }`, and launch `run(jobId, input)` without awaiting it.
- [x] Implement `run` with the exact sequence `pending -> parsing -> compiling -> done/error`; read the archived file, parse the file, create the preview, call `ingestWikiSource`, and store the existing result fields plus `graphErrors`.
- [x] Treat graph warnings as `done` with a warning step, while compiler/parse failures become `error`.
- [x] Ensure all caught errors are converted to `Error.message` and no unhandled rejection escapes the background task.
- [x] Add tests for success, parse failure, compile failure, graph warning, and validation failure without creating a Job.
- [x] Run `cd server && npx vitest run __tests__/wikiIngestionJobService.test.ts`.

### Task 4: Migrate the Web route to the shared service

**Files:**
- Modify: `server/routes/wiki.ts`
- Modify: `server/services/api/wikiIngestionJobService.ts` if Express-specific dependency wiring is needed
- Test: `server/__tests__/api.test.ts` or a focused Wiki route test

- [x] Remove route-local `processJob`, direct archive logic, and direct parse/compile orchestration.
- [x] Keep Multer, request validation response codes, and the existing success response keys.
- [x] Wire the route to the shared `WikiIngestionJobService` and JobStore.
- [x] Keep `GET /jobs/:jobId` backed by the shared JobStore and preserve the existing 404 response.
- [x] Add/adjust route and shared-service tests for unsupported files, oversized files, successful start, and shared result fields.
- [x] Run `cd server && npx vitest run __tests__/api.test.ts __tests__/wikiIngestionJobService.test.ts`.

### Task 5: Migrate Electron IPC to the shared service

**Files:**
- Modify: `electron/ipc/wiki.js`
- Modify: `server/electron-bundle.ts` if an additional shared export is required
- Modify: `electron/preload.js` only if the result contract requires a typed exposure update
- Test: `server/__tests__/ipcHandlers.test.ts`

- [x] Remove Electron-local archive naming, `global.__wikiJobs`, and `processElectronWikiJob` orchestration.
- [x] Load the shared job service from the existing Electron service bundle; keep Electron-only shell behavior in the IPC adapter.
- [x] Return the same start response keys as the HTTP route and expose the shared JobStore result from `wiki:getJobStatus`.
- [x] Preserve `wiki:openInObsidian` behavior.
- [x] Update IPC registration expectations to include the existing `wiki:openInObsidian` handler.
- [x] Run `cd server && npx vitest run __tests__/ipcHandlers.test.ts`.

### Task 6: Update change traceability and verify the full repository

**Files:**
- Modify: `docs/changes/2026-07-15-wiki-ingestion-job-unification/traceability.md`
- Modify: `docs/changes/2026-07-15-wiki-ingestion-job-unification/exec-plan.md`

- [x] Record each completed task, changed files, test command, and known issue in the execution record.
- [x] Run `npm test` and require all non-skipped tests to pass.
- [x] Run `npm run build` and require both server TypeScript and client Vite builds to pass.
- [x] Run `git diff --check` and inspect the final diff for changes outside the approved scope.
- [x] Report remaining lint warnings separately from failures; no required test or build is failing.
