# Naming Conventions

## Rule
Use consistent naming patterns across the codebase. Names must be self-documenting.

## File Naming
- **Server:** camelCase for files (`conversationRepository.ts`, `settingsService.ts`)
- **Client:** PascalCase for components (`ChatArea.tsx`, `Settings.tsx`), camelCase for hooks/services
- **Tests:** match source file name with `.test.ts` suffix (`api.test.ts`)
- **Types:** PascalCase, exported from dedicated type files (`types.ts` or `types/` directory)

## Export Naming
```typescript
// Good: named exports (tree-shakeable, explicit)
export function getConversation(id: string) { ... }
export const MAX_MESSAGES = 100;

// Bad: default exports (harder to rename, implicit)
export default function getConversation(id: string) { ... }
```

## Variable Naming
```typescript
// Good: descriptive names
const conversationRepository = new ConversationRepository();
const isStreamingResponse = true;

// Bad: abbreviations or single letters (except loop vars)
const convRepo = new ConversationRepository();
const s = true;
```

## DON'T

```typescript
// Bad: inconsistent naming conventions
export class conversation_repo { ... }  // snake_case class
export const APIURL = '...';            // should be apiUrl or API_URL
```
