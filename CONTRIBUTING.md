# Contributing

Thank you for helping improve Baba Selo. This repository is a local development app; keep the default startup self-contained and reproducible.

## Development

1. Install Node.js 22+ and SpacetimeDB 2.10.2.
2. Run `npm ci` and copy `.env.example` to `.env.local`.
3. Run `npm run dev` and sign in as the local developer.
4. Keep changes focused and describe the behavior they change.

Before opening a pull request, run:

```sh
npm run typecheck
npm run check --prefix spacetimedb
npm test
npm run build
```

For backend changes, keep the app running and run `npm run test:integration`. Install module dependencies with `npm ci --prefix spacetimedb` if you have not started the stack yet. Update the setup docs and `.env.example` when changing configuration. Keep lockfiles in sync with dependency changes.

New tests should check behavior, failure modes, or data ownership. Unit tests and CI must not require API keys or make paid provider calls. The integration tests use deterministic embeddings.

## Issues and pull requests

Include the expected behavior, observed behavior, reproduction steps, and relevant Node.js/SpacetimeDB versions. Include a screenshot for meaningful UI changes and explain how you tested the change. Use small, reviewable changes when possible.

Never attach API keys, `.env.local`, `.local/`, database dumps, owner tokens, session cookies, private recipe datasets, or personal uploads. Share only sanitized diagnostics. Report vulnerabilities according to [SECURITY.md](SECURITY.md).

Contributions are provided under the repository's [MIT License](LICENSE).
