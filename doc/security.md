# Security Utilities

Source: `src/security/`

This document covers the security utilities available in the application, the enforced
password policy, and guidelines for future auth hardening.

---

## Password Hashing

### Algorithm: Argon2id

Passwords are hashed with **argon2id** via the [`argon2`](https://www.npmjs.com/package/argon2)
npm package (native Node.js bindings via N-API).

Argon2id was selected because:

- Winner of the 2015 Password Hashing Competition
- Resistant to both GPU brute-force and side-channel attacks (hybrid of Argon2i + Argon2d)
- Recommended by [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
  and NIST SP 800-63B

### Parameters

| Parameter    | Value           | Notes                              |
|--------------|-----------------|------------------------------------|
| `type`       | argon2id        | Best general-purpose profile       |
| `memoryCost` | 19 456 KiB (19 MiB) | OWASP minimum recommendation  |
| `timeCost`   | 2               | OWASP minimum recommendation       |
| `parallelism`| 1               | Scale memory instead of threads    |

Defined as `ARGON2_OPTIONS` in `src/security/password.ts`.

**Tuning:** Target 100–300 ms wall-clock time on production hardware. Increase
`memoryCost` first (cheapest trade-off). Re-benchmark after infrastructure changes.

### API

```ts
import { hashPassword, verifyPassword } from "../security/index.js";

const hash = await hashPassword(plain);          // store in users.password_hash
const ok   = await verifyPassword(plain, hash);  // boolean — never throws on mismatch
```

The hash string is self-describing (algorithm + params + salt), so it can be stored
directly in the `password_hash` column and will survive parameter upgrades gracefully
(argon2.verify reads params from the hash itself).

---

## Password Policy

### Minimum Length

Enforced by `validatePasswordStrength(plain)` in `src/security/password.ts`.

| Rule            | Value         |
|-----------------|---------------|
| Minimum length  | **12 characters** |

The function returns a discriminated union — not an exception — so the caller controls
how to surface the error:

```ts
import { validatePasswordStrength } from "../security/index.js";
import { BadRequestError } from "../http/errors.js";

const result = validatePasswordStrength(body.password);
if (!result.ok) throw new BadRequestError(result.reason);
```

### Future: Entropy Scoring with zxcvbn

A character-count minimum is a baseline, not a complete policy. The planned next step
is entropy-based scoring using [zxcvbn](https://github.com/dropbox/zxcvbn) (or its
successor `zxcvbn-ts`):

```ts
// Planned addition to validatePasswordStrength():
import { zxcvbn } from "@zxcvbn-ts/core";

const score = zxcvbn(plain);
if (score.score < 3) {
  return {
    ok: false,
    reason: score.feedback.suggestions[0] ?? "Password is too weak",
  };
}
```

A score ≥ 3 (of 4) is a sensible threshold. The `validatePasswordStrength` signature
stays the same, so callers require no changes.

---

## Login Error Messages

**Rule: always return a generic error for any authentication failure.**

Never reveal whether the email does not exist or the password was wrong.

```ts
// Correct
throw new UnauthorizedError("Invalid credentials");

// Wrong — reveals account existence
throw new UnauthorizedError("No account found for this email");
throw new UnauthorizedError("Incorrect password");
```

This applies everywhere that touches the `users` table in an auth context:

- Email/password login
- Refresh token validation (invalid / expired / revoked)
- Password reset flows

---

## Constant-Time Comparison

`safeEqual(a, b)` in `src/security/safe-compare.ts` wraps `crypto.timingSafeEqual`
to prevent timing side-channels when comparing secrets.

```ts
import { safeEqual } from "../security/index.js";

// Token lookup — compare stored hash against computed hash of incoming token
const match = safeEqual(computedHash, storedHash);
```

**Use for:** comparing pre-hashed token values (refresh tokens, API keys).

**Do NOT use for:** password verification — use `verifyPassword()` instead, which
delegates to `argon2.verify` (internally timing-safe).

If the two strings have different byte lengths, a dummy comparison is still executed
so the function takes consistent wall-clock time before returning `false`.

---

## Refresh Token Generation

`randomTokenBytes(byteCount?)` in `src/security/tokens.ts` uses `crypto.randomBytes`
to produce cryptographically secure tokens.

### Recommended Token Lifecycle

```ts
import crypto from "node:crypto";
import { randomTokenBytes, safeEqual } from "../security/index.js";

// --- Issuance ---
const raw            = randomTokenBytes(32);                        // 256-bit entropy
const tokenForClient = raw.toString("base64url");                   // send in cookie / body
const tokenForDb     = crypto.createHash("sha256")
                             .update(raw)
                             .digest("hex");                        // store in DB

// INSERT INTO refresh_tokens (token_hash, …) VALUES (tokenForDb, …)

// --- Validation ---
const incoming    = Buffer.from(clientToken, "base64url");
const incomingHash = crypto.createHash("sha256").update(incoming).digest("hex");
const isValid      = safeEqual(incomingHash, storedHash);
```

Why hash the token before storage? If the database is compromised, raw tokens cannot
be replayed. SHA-256 is sufficient here because the raw token already has 256 bits of
entropy (unlike passwords, which have low entropy and require a slow KDF).

---

## Email Normalization

`normalizeEmail(email)` in `src/security/email.ts` applies:

1. `trim()` — strips accidental surrounding whitespace
2. `toLowerCase()` — case-insensitive lookup (all major providers treat local-parts as case-insensitive)

Always normalize before INSERT and before SELECT:

```ts
import { normalizeEmail } from "../security/index.js";

const email = normalizeEmail(body.email);
const user  = await db.selectFrom("users").where("email", "=", email)…
```

---

## Future: Rate Limiting & Account Lockout

**Not implemented in Sprint 2.** Below describes where hooks would be inserted.

### Hook Location

Add a `preHandler` hook on the login route (or as a scoped plugin on the auth router):

```ts
// Planned: src/plugins/auth-rate-limit.ts
import type { FastifyPluginAsync } from "fastify";
import { TooManyRequestsError } from "../http/errors.js";

const MAX_ATTEMPTS = 10;
const WINDOW_MS    = 15 * 60 * 1000; // 15 minutes

export const authRateLimitPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (request) => {
    const key      = `login:${normalizeEmail(request.body?.email ?? "")}`;
    const attempts = await rateLimiter.increment(key, WINDOW_MS);
    if (attempts > MAX_ATTEMPTS) {
      throw new TooManyRequestsError("Too many login attempts, please try again later");
    }
  });
};
```

### State Store Options

| Option                              | Pros                       | Cons                               |
|-------------------------------------|----------------------------|------------------------------------|
| In-memory (`@fastify/rate-limit`)   | Zero infra                 | Lost on restart, not distributed   |
| PostgreSQL table                    | No extra infra dependency  | Slower, needs a cleanup job        |
| Redis (`ioredis` + `@fastify/rate-limit`) | Fast, distributed   | Extra infra dependency             |

Start with `@fastify/rate-limit` (in-memory) for Sprint 3; migrate to Redis before
multi-instance deployment.

### Error Class to Add

```ts
// src/http/errors.ts
export class TooManyRequestsError extends AppError {
  readonly statusCode = 429;
  readonly type       = "https://errors.chargeops.dev/too-many-requests";
  readonly title      = "Too Many Requests";
}
```

The global error handler already handles any `AppError` subclass, so no changes to
`error-handler.ts` are required.
