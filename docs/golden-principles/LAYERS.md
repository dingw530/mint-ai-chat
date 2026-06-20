# Layer Boundaries

## Rule
Respect the layer hierarchy defined in `docs/architecture/LAYERS.md`. Never skip layers. Never import across package boundaries.

## DO

```typescript
// Good: endpoint imports service (correct layer)
import { getConversation } from '../services/conversationService';

// Good: service imports repository (correct layer)
import { getConversationRepo } from '../repositories/conversationRepository';

// Good: type-only import from any layer
import type { Message } from '../types';
```

## DON'T

```typescript
// Bad: endpoint imports repository directly (skips service layer)
import { getConversationRepo } from '../repositories/conversationRepository';

// Bad: importing from client in server code
import { apiClient } from '../../client/src/services/api';

// Bad: feature importing from another feature
import { ChatMessage } from '../chat/components/ChatMessage';
```

## Exceptions
- Type-only imports (`import type`) from any layer are always allowed
- The entry point file (index.ts, App.tsx) may import from any layer below it
- Test files may import from any layer for mocking purposes
