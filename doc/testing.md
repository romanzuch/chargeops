# Testing Strategy

## Philosophy

Tests should validate behavior, not implementation details.

We focus on:

* Integration-level confidence
* Deterministic database state
* Clear failure messages

---

## Integration Tests

Integration tests:

* Use real PostgreSQL instance
* Reset schema before running
* Apply migrations
* Call endpoints using `app.inject()`

Example:

```
const response = await app.inject({
  method: 'GET',
  url: '/health'
})
```

---

## Database Reset

Before integration tests:

* Drop public schema
* Recreate schema
* Reapply migrations

This ensures a clean test environment.

---

## When to Add Tests

Add tests when:

* Introducing new routes
* Changing database schema
* Modifying authentication logic
* Fixing bugs

---

## Future Improvements

* Add unit tests for service layer
* Add test coverage reporting
* Add CI pipeline execution
* Add performance smoke tests
