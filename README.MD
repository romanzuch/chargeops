# ChargeOps

ChargeOps is a TypeScript-first backend foundation for a scalable billing and operations platform. It is built with Fastify, PostgreSQL, and Kysely, with a strong focus on type safety, structured error handling, and clean architecture.

The goal of this project is to provide a solid, production-ready foundation for building a multi-tenant, secure, and extensible backend system.

---

## Tech Stack

- Node.js (ESM)
- TypeScript
- Fastify
- PostgreSQL
- Kysely (SQL-first query builder)
- Zod (environment validation)
- Vitest (testing)
- Docker / Docker Compose

---

## Project Structure

```
src/
  app.ts              # Fastify app factory
  main.ts             # Server bootstrap
  config/             # Environment configuration
  db/                 # Database setup & migrations
  plugins/            # Fastify plugins (error handling, request context)
  routes/             # Route definitions

test/
  integration/        # Integration tests
  setup/              # Test setup scripts

doc/                  # Project documentation
```

---

## Getting Started

### 1. Install dependencies

```
npm install
```

### 2. Configure environment

Copy the example file:

```
cp .env.example .env
```

Adjust values if needed.

### 3. Start the database

```
make db-up
```

Or manually:

```
docker compose up -d
```

### 4. Run migrations

```
npm run db:migrate
```

### 5. Start the server

```
npm run dev
```

Server will run on:

```
http://localhost:3000
```

Health check:

```
GET /health
```

---

## Testing

Run unit + integration tests:

```
npm test
```

Integration tests automatically:

- spin up a test database
- reset schema
- apply migrations

---

## Design Principles

- SQL-first database design
- Strong type safety end-to-end
- Centralized error handling (Problem Details format)
- Clean separation of concerns
- Testable app factory (`buildApp()`)

---

## Next Milestones

- Authentication (JWT + refresh tokens)
- Multi-tenancy support
- Role-based access control
- Billing domain models (charges, invoices)
- CI pipeline (GitHub Actions)

---

## License

MIT
