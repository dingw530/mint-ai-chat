# Error Handling

## Rule
Errors must be typed, actionable, and include context for debugging. Never swallow errors silently.

## Server Errors

```typescript
// Good: typed error with context
throw new AppError('CONVERSATION_NOT_FOUND', `Conversation ${id} not found`, 404);

// Good: catch and re-throw with context
try {
  await saveMessage(message);
} catch (error) {
  throw new AppError('MESSAGE_SAVE_FAILED', `Failed to save message: ${error.message}`, 500);
}

// Bad: swallowing errors
try {
  await saveMessage(message);
} catch (e) {
  console.log(e); // silent failure
}
```

## Client Errors

```typescript
// Good: user-facing error with recovery suggestion
try {
  await sendMessage(content);
} catch (error) {
  showToast('Failed to send message. Check your connection and try again.');
}

// Bad: exposing raw error to user
try {
  await sendMessage(content);
} catch (error) {
  alert(error.toString()); // shows technical jargon
}
```

## API Error Response Format

```typescript
// Standard error shape
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": { /* optional context */ }
  }
}
```

## DON'T

```typescript
// Bad: bare catch without logging or re-throwing
try { ... } catch (e) { }

// Bad: generic error codes
throw new Error('Error occurred'); // no context, no actionable info
```
