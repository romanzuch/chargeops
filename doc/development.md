# Development Guide

## Local Development Workflow

1. Start database

```
make db-up
```

2. Run migrations

```
npm run db:migrate
```

3. Start server in watch mode

```
npm run dev
```

---

## Environment Files

- `.env` for local development
- `.env.test` for integration tests

Never commit real secrets.

---

## Database Migrations

Migration files are stored as raw SQL.

Naming convention:

```
YYYYMMDD_description.sql
```

They are executed in alphabetical order.

Best practice:

- Wrap migration steps in transactions
- Never modify old migrations
- Create new migration files for schema changes

---

## Code Style

- Strict TypeScript
- No `any`
- Explicit return types for exported functions
- Small, focused modules

---

## Adding a New Route

1. Create a new route file in `src/routes`
2. Register it in `app.ts`
3. Add integration test
4. Ensure error handling is consistent

---

## Logging

- Pino logger (via Fastify)
- Sensitive fields redacted
- Request ID included in responses

---

## Debugging Tips

- Use `/health` endpoint for quick validation
- Enable debug logging via environment variable
- Check database connection on startup errors
