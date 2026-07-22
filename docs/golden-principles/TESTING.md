# Testing Conventions

## Rule
Tests verify behavior, not implementation. Each test must be isolated and deterministic.

## Test Structure

```typescript
// Good: descriptive test names that explain behavior
describe('ConversationRepository', () => {
  describe('create', () => {
    it('creates a conversation with generated UUID', async () => { ... });
    it('throws when database is unavailable', async () => { ... });
  });
});

// Bad: testing implementation details
describe('ConversationRepository', () => {
  it('calls db.run with correct SQL', async () => { ... }); // brittle
});
```

## Test File Organization

- **Location:** `__tests__/` directories alongside the corresponding server and client source files
- **Naming:** `{feature}.test.ts` matching the feature being tested
- **Setup:** Use `beforeEach` for test isolation, not `beforeAll`
- **Mocking:** Mock external dependencies (APIs, databases) at the boundary, not internal functions

## Integration Tests

```typescript
// Good: test real behavior with controlled inputs
it('returns 404 for non-existent conversation', async () => {
  const res = await request(app).get('/api/conversations/nonexistent');
  expect(res.status).toBe(404);
});
```

## DON'T

```typescript
// Bad: testing internal implementation
it('uses the correct database query', () => {
  const spy = vi.spyOn(db, 'run');
  createConversation();
  expect(spy).toHaveBeenCalledWith('INSERT INTO conversations...'); // fragile
});

// Bad: tests that depend on execution order
it('first test', () => { sharedState = 'modified'; });
it('second test', () => { expect(sharedState).toBe('modified'); }); // order-dependent
```
