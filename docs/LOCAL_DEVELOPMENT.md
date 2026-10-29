# Local development

## Requirements

- Node.js 22+ and npm.
- [SpacetimeDB 2.10.2](https://spacetimedb.com/install), matching the module package version.
- A supported cloud account or local inference server only when you want AI features. See [provider setup](AI_PROVIDERS.md).

The default setup uses native SpacetimeDB and PostgreSQL/pgvector through PGlite. It needs no Docker engine, database account, or third-party sign-in.

```sh
npm ci
# Copy .env.example to .env.local, then configure your cloud or local AI provider.
npm run dev
```

Open `http://127.0.0.1:3001/login`. The seeded developer has admin and Pro access. The AI explorer is at `/admin/ai`.

On Windows, the launcher finds the installed standalone server under `%LOCALAPPDATA%/SpacetimeDB/bin/`, preferring 2.10.2. On other platforms it runs `spacetime start`. Set `SPACETIME_SERVER_BIN` to an absolute standalone-server path when needed.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | `openai` | Cloud or local provider; see [provider matrix](AI_PROVIDERS.md) |
| `AI_MODEL` | Provider-specific | Text model ID or deployment name |
| `AI_API_KEY` | Unset | Selected chat provider credential (native key variables also work) |
| `AI_BASE_URL` | Provider preset | Override provider endpoint |
| `AI_EMBEDDING_PROVIDER` | Provider-specific | Independent embedding service or `disabled` |
| `OPENAI_API_KEY` | Unset | OpenAI credential; optional media generation/transcription |
| `LOCAL_APP_PORT` | `3001` | Next.js port |
| `LOCAL_POSTGRES_PORT` | `5433` | Embedded PostgreSQL port |
| `LOCAL_SPACETIME_PORT` | `3100` | Native SpacetimeDB port |
| `LOCAL_POSTGRES_URL` | Unset | Use your PostgreSQL server instead of PGlite |
| `LOCAL_SPACETIMEDB_URL` | `http://127.0.0.1:3100` | SpacetimeDB address |
| `LOCAL_SPACETIMEDB_DATABASE` | `baba-selo-local` | Module database name |
| `SPACETIME_SERVER_BIN` | Auto-detected | Native server executable |

The launcher reads `.env.local`, then `.env`. It passes the selected local database URLs to Next.js as `POSTGRES_URL`, `DATABASE_URL`, and `SPACETIMEDB_URL`. A stale cloud database environment cannot silently override those local defaults. Production payment, email, and cron credentials are removed from the launched app's environment.

## Persistent state

| Path | Contents |
| --- | --- |
| `.local/spacetimedb` | Native SpacetimeDB database files |
| `.local/postgres` | Persistent PGlite PostgreSQL data |
| `.local/uploads` | Uploaded and generated images |
| `.local/session-key` | Local session signing secret |
| `.local/spacetime-owner.json` | SpacetimeDB owner credential |
| `.local/jwt-*.pem` | Native server's identity keys |
| `.local/dev.lock` | PID of the active local service launcher |

All of these paths are ignored by Git. The startup seed inserts only missing documents; it does not overwrite existing recipes or preferences. Keep database files and the owner credential together when making a private backup. A different owner identity cannot read an existing private database.

Only one launcher may open this checkout's PGlite directory. An active PID lock prevents concurrent starters, and a stale lock is recovered when its process no longer exists. Use Ctrl+C before changing ports or switching database runtimes.

## Regular PostgreSQL

Install PostgreSQL and [pgvector](https://github.com/pgvector/pgvector), create a database, then set:

```dotenv
LOCAL_POSTGRES_URL=postgresql://YOUR_LOCAL_USER:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/baba_selo
```

`npm run dev` uses this server instead of starting PGlite. The server must have pgvector installed, and the role must be able to run `CREATE EXTENSION IF NOT EXISTS vector`. LangChain creates its semantic tables on first use.

PGlite uses the same PostgreSQL SQL surface through a local TCP server, but multiplexes clients onto one PostgreSQL backend. Use regular PostgreSQL when you need concurrent production database workloads.

## Managing your own servers

Start PostgreSQL and SpacetimeDB yourself and configure their `LOCAL_*` URLs, then:

```sh
npm run dev -- --external
```

This still publishes the database module and seeds missing fixtures. The launcher does not stop external servers. `npm run local:setup -- --external` performs setup without starting Next.js.

## Optional Docker

```sh
npm run dev -- --docker
# Stop the app with Ctrl+C, then:
npm run docker:stop
```

Compose runs PostgreSQL/pgvector and SpacetimeDB in named volumes. Docker is never invoked by default startup. Those volumes are separate from the native database directories. Use a separate checkout when switching stacks so database-owner credentials stay with their original server.

## Production build on your machine

```sh
npm run build
npm start
```

`npm start` initializes the local stack and serves the existing build on the configured loopback port. Build and development mode use the same local session policy. This is a local production-build preview, not a public deployment template.

## Verification

```sh
npm run typecheck
npm ci --prefix spacetimedb
npm run check --prefix spacetimedb
npm test
npm run build
```

With `npm run dev` running in another terminal:

```sh
npm run test:integration
npm run sync:recipes -- --dry-run
```

Integration tests use temporary documents and a temporary vector table. They verify sessions, same-origin checks, admin access, graph topology, concurrent increments, atomic rollback, nested documents, image upload/read/delete, and real LangChain pgvector queries. Test embeddings are deterministic; the tests never contact an AI provider.

`npm run sync:recipes` makes embedding requests and can incur provider charges. Use `--dry-run` first to see how many recipes would be indexed. The original private corpus is not included; empty-corpus retrieval falls through to recipe generation.

## Troubleshooting

- **SpacetimeDB command missing:** install the matching CLI or set `SPACETIME_SERVER_BIN`.
- **Port already in use:** stop the other instance or adjust the corresponding `LOCAL_*_PORT` variable.
- **Active launcher lock:** stop the existing `npm run dev` process. Do not run two PGlite processes against one directory.
- **Database permission failure:** confirm you are using the original `.local/spacetime-owner.json` for this server.
- **Images or history fail after sign-in:** check the local server terminal and sign in again at `/login`.
- **AI requests fail:** check the selected provider and model in `/admin/ai`, then verify its credentials, tool support, quota, or local server. See [provider troubleshooting and configuration](AI_PROVIDERS.md).
- **First startup is slow:** the module's npm dependencies and the initial Next.js pages are compiled on first use.

Do not publish `.local/`, `.env.local`, logs, database dumps, uploads, or private ingested datasets. The [security policy](../SECURITY.md) explains the local trust boundary.
