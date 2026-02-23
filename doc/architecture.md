# Architecture Overview

## Application Factory Pattern

The application is built using a factory function (`buildApp`) instead of instantiating Fastify directly in `main.ts`.

This enables:

* Clean testability via `app.inject()`
* Dependency injection in the future
* Decoupled bootstrapping logic

---

## Plugin-Based Cross-Cutting Concerns

Cross-cutting concerns are implemented as Fastify plugins:

* Request context (request ID, timing)
* Error handling (Problem Details)

This keeps the main application logic clean and modular.

---

## Error Handling Strategy

All errors are normalized to RFC 7807 (Problem Details format):

```
application/problem+json
```

Benefits:

* Consistent API contract
* Better frontend integration
* Easier debugging

---

## Database Layer

The project uses:

* PostgreSQL
* Kysely for typed SQL queries
* Raw SQL migration files

Design principles:

* SQL-first approach
* Explicit schema evolution
* Avoid heavy ORM abstractions

---

## Environment Validation

Environment variables are validated using Zod at startup.

If validation fails, the application exits immediately.

This prevents:

* Misconfigured production deployments
* Silent runtime configuration bugs

---

## Testing Strategy

Integration tests:

* Spin up test database
* Reset schema
* Apply migrations
* Use `app.inject()` for HTTP-level testing

This ensures realistic but deterministic test execution.

---

## Future Architecture Extensions

* Auth module (JWT + refresh token rotation)
* Multi-tenant context isolation
* Domain-driven module boundaries
* Event-driven extensions (optional)
