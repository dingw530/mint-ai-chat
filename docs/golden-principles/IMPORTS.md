# Import Conventions

## Rule
Imports must follow layer hierarchy. Never import across package boundaries. Use path aliases.

## DO

```typescript
// Good: service imports from repository (allowed layer)
import { getConversation } from '../repositories/conversationRepository';

// Good: type-only import from any layer
import type { Message } from '../types';

// Good: relative imports within same package
import { logger } from './utils/logger';
```

## DON'T

```typescript
// Bad: endpoint imports repository directly (skips service layer)
import { getMessageRepo } from '../repositories/messageRepository';

// Bad: importing from another package directly
import { apiClient } from '../../client/src/services/api';

// Bad: deep relative imports (../../../)
import { something } from '../../../../shared/types';
```

## Exceptions
- Type-only imports (`import type`) from any layer are always allowed
- The entry point file (index.ts, App.tsx) may import from any layer below it
- Test files may import from any layer for mocking purposes
