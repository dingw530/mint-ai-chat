# Architecture Layers

Mint is a TypeScript monorepo with three independent packages. Each package has its own internal layer hierarchy. Cross-package imports follow strict rules.

## Package Structure

```
client/          React SPA — UI layer
server/          Express API — backend layer
electron/        Desktop shell — wrapper layer
shared/          (reserved) — future shared types/utils
```

## Dependency Direction

```
electron → client → server
         ↓
      (no reverse)
```

**electron** may import from **client** (built assets) and **server** (Node.js modules).
**client** may NOT import from **server** (they communicate via HTTP/SSE only).
**server** may NOT import from **client**.
**shared** (when added) may be imported by both client and server.

## Server Layer Hierarchy

```
types          No app imports (pure definitions)
migrations     types only (database schema)
repositories   migrations/, types (data access)
services       repositories/, types (business logic)
endpoints      services/, middleware/, types (API handlers)
middleware     services/, types (request processing)
```

**Rule:** Each layer may only import from layers to its LEFT. Never skip layers (e.g., endpoints must not import repositories directly).

## Client Layer Hierarchy

```
types          No app imports (pure definitions)
services       types only (API client)
shared         services/, types (shared UI components)
features       shared/, services/, types (feature modules)
components     features/, shared/, types (global UI)
App            components/, features/, types (entry point)
```

**Rule:** Feature modules must not import from other features. Use shared/ for cross-feature code.

## Exceptions

- **Provider pattern:** Cross-cutting concerns (auth, config, logging) are injected via providers, not direct imports. See `docs/golden-principles/IMPORTS.md`.
- **Type-only imports:** `import type { X }` from any layer is always allowed — type imports are erased at compile time and create no runtime dependency.

## Violation Remediation

When you see a violation like:
```
VIOLATION: server/endpoints/foo.ts imports server/repositories/bar.ts
— endpoints cannot import repositories directly. See docs/architecture/LAYERS.md
```

**Fix:** Route through the service layer. Move the business logic to `server/services/`, then import the service from the endpoint.

```typescript
// BAD: endpoint imports repository directly
import { getConversation } from '../repositories/conversationRepository';

// GOOD: endpoint imports service
import { getConversation } from '../services/conversationService';
```
