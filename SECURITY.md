# Security policy

## Local development boundary

The default app listens on loopback and shares one seeded developer account with admin and Pro access. It is designed for development on a trusted machine. Middleware rejects non-loopback hosts and cross-origin requests, and local data writes require a signed session. This is not a multi-user public authentication system.

Do not expose the app through a public tunnel or deploy the developer sign-in publicly. Public hosting requires an appropriate identity provider, per-user authorization, request validation, rate limits, secret handling, and a production storage design.

The SpacetimeDB document tables are private. Only the database owner's identity can read them or call the mutation reducer. The credential is stored under `.local/` and must never be sent to the browser. Image routes validate paths and accept supported raster image content types. Files, session signing keys, and database files belong to the local checkout.

PGlite is intended for local development. The default TCP database service is bound to loopback; do not expose it to untrusted clients. External AI requests send prompts or media to the configured provider, so do not use sensitive personal data in test prompts.

## Reporting a vulnerability

Use the repository's GitHub **Security → Report a vulnerability** feature when private reporting is enabled. If it is unavailable, open an issue requesting a private reporting channel without posting exploit details, secrets, or personal data.

Include the affected version or commit, impact, reproduction steps, and a minimal example using synthetic data. Please allow maintainers to investigate before publishing exploit details. No response-time guarantee is currently offered.

## Secret handling

Keep credentials in `.env.local`, never in source files. Git ignores environment files, local data, keys, logs, and generated output. `.env.example` must contain placeholders only. If a credential has been committed, revoke or rotate it and review repository history; deleting it from the latest commit alone is insufficient.

Run `npm audit` when updating dependencies and validate updates with type checks, tests, and a production build. Third-party dependencies and SpacetimeDB retain their own licensing and security policies.
