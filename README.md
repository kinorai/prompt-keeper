# Prompt Keeper
### **Never lose a single LLM conversation again!**

**Prompt Keeper** is an open-source LLM API proxy providing a **rich user interface to search and analyze historical LLM conversations**. The system intercepts API calls, **forwards them to LiteLLM** for processing, and stores the resulting conversation data in **Postgres**, which also runs the search. It is fully **OpenAI compatible**.

## Features 🌟

-   😌 **Interactive frontend** for searching and filtering conversations
-   🧠 **Conversation storage** in Postgres (single source of truth), with full-text search in Postgres or, optionally, OpenSearch
-   ✅ **OpenAI-compatible API** proxy that routes requests to LiteLLM
-   🔄 **Outbox pattern** for reliable async syncing from Postgres to OpenSearch, when OpenSearch runs the search

## How to Install 🚀

1. Download the docker-compose.yml and .env:
   ```bash
   curl -O https://raw.githubusercontent.com/kinorai/prompt-keeper/main/docker-compose.yml
   curl -o .env https://raw.githubusercontent.com/kinorai/prompt-keeper/main/.env.example
   curl -o config.litellm.yaml https://raw.githubusercontent.com/kinorai/prompt-keeper/main/files/config.example.litellm.yaml
   ```

2. Replace every `change-me` value in `.env` with your own secret before the first start. The placeholders are public, so an unchanged one is a credential anyone can use. Generate each secret with:
   ```bash
   openssl rand -hex 32
   ```
   Keep the `sk-` prefix on `LITELLM_MASTER_KEY`, which LiteLLM requires. A `PROMPT_KEEPER_API_KEY` that still starts with `change-me` is ignored.

3. Start the services:
   ```bash
   docker-compose up -d
   ```

4. Access the UI at http://localhost:3000 and sign up: the first account becomes the admin.

Only the app's port 3000 is published on all interfaces. MinIO and LiteLLM (and OpenSearch, security disabled, when its profile is on) bind to `127.0.0.1`, and the MinIO bucket is private; images are served through presigned URLs.

### Available Docker Tags

- `kinorai/prompt-keeper:latest` - Latest release
- `kinorai/prompt-keeper:vx.y.z` - Specific version (see [releases page](https://github.com/kinorai/prompt-keeper/releases) for available versions)

The same tags exist for `kinorai/prompt-keeper-outbox-worker` and `kinorai/prompt-keeper-migrate`. Run them at the same version as the app. The outbox worker is only needed with `SEARCH_BACKEND=opensearch`.

## Database Migrations 🗄️

The schema is applied by a dedicated run-once image, `kinorai/prompt-keeper-migrate`, which runs `prisma migrate deploy` and exits. It is a separate image on purpose: the app never migrates on startup, so multiple replicas cannot race each other and a failed migration shows up as one failed container instead of a crashloop.

**Docker Compose** — nothing to do. `docker-compose.yml` includes a `migrate` service, and the app and worker declare `depends_on: { migrate: { condition: service_completed_successfully } }`, so `docker compose up -d` migrates first and only then starts the app.

**Plain `docker run`, or any other orchestrator** — run it once before rolling out the new app version:

```bash
docker run --rm --env-file .env kinorai/prompt-keeper-migrate:vx.y.z
```

**Kubernetes** — run it as a `pre-install,pre-upgrade` Helm hook `Job` (or an Argo CD `PreSync` hook) so it completes before the Deployment is updated.

The image needs only `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING`. It is idempotent — already-applied migrations are skipped — and exits non-zero on failure, so it is safe to gate a rollout on. The entrypoint is overridable for incident work, e.g. `docker run --rm --env-file .env kinorai/prompt-keeper-migrate:vx.y.z migrate status`.

Migrations are written to be backwards compatible with the previous release (expand, then contract in a later version), so the running pods keep working while a migration is applied and a rollback of the app image does not need a schema rollback.

## Search 🔎

`SEARCH_BACKEND` picks where `/api/search` runs:

- **`postgres`** (default): full-text search in the Postgres database the conversations live in, with the `pg_trgm` and `unaccent` extensions (both trusted: the migration creates them as the database owner, no superuser needed). No other service, no sync lag. The app deletes a deleted conversation's images from S3 itself.
- **`opensearch`**: the OpenSearch index, kept in sync by the outbox worker below. Run the `opensearch` and `outbox-worker` services (`docker compose --profile opensearch up -d`) and set the `OPENSEARCH_*` variables.

The query syntax is the same on both: words are ANDed, `|` is OR, `-word` excludes, `"quotes"` match a phrase, `word*` forces a prefix, parentheses group, and `role:user` / `model:"gpt-4o"` filter. Matching is accent- and case-insensitive; a word matches as the start of a longer word (as you type), and a 3-4 letter word also matches inside longer ones. [docs/search.md](docs/search.md) has the details and the benchmark against OpenSearch.

Switching from `opensearch` to `postgres` needs nothing more than the variable: the migration indexes the existing messages, and the OpenSearch services can be stopped. Switching the other way needs the index rebuilt, since the app queues no index updates while it searches Postgres: start OpenSearch and the worker, set the variable, then queue every conversation once and let the worker index them:

```sql
INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id)
SELECT gen_random_uuid()::text, 'conversation.upserted', 'conversation', id FROM conversations;
```

## Search Index Sync 🔁

With `SEARCH_BACKEND=opensearch`, Postgres is still the source of truth. Every conversation write or delete also records an event in `outbox_events`, and the outbox worker applies it to OpenSearch (and deletes a deleted conversation's images from S3).

A failed event is retried with exponential backoff: 10 s, 20 s, 40 s, … up to one hour between attempts. Connection errors, timeouts, throttling (429) and 5xx responses are retried for as long as the outage lasts, so nothing is lost while OpenSearch is down. Only an event that OpenSearch itself rejects (another 4xx, such as a mapping or validation error) `OUTBOX_MAX_ATTEMPTS` times (default 10) is dead-lettered: the worker logs it at error level and stops retrying it.

List dead-lettered events:

```sql
SELECT id, event_type, aggregate_id, rejected_attempts, last_error, dead_lettered_at
FROM outbox_events
WHERE dead_lettered_at IS NOT NULL AND processed_at IS NULL
ORDER BY dead_lettered_at;
```

After fixing the cause (for example the index mapping), requeue them. The worker picks them up on its next poll:

```sql
UPDATE outbox_events
SET dead_lettered_at = NULL, rejected_attempts = 0, next_attempt_at = NULL, locked_at = NULL, lock_id = NULL
WHERE dead_lettered_at IS NOT NULL AND processed_at IS NULL;
-- add "AND id = '...'" to requeue a single event
```

## LiteLLM Integration 🔄

Prompt Keeper uses [LiteLLM](https://docs.litellm.ai/docs/) as its LLM routing layer. LiteLLM is a unified API for various LLM providers that:

- Provides a single OpenAI-compatible interface for 100+ LLM APIs (OpenAI, Anthropic, Gemini, etc.)
- Handles load balancing, fallbacks, and caching
- Offers detailed logging and observability
- Supports streaming responses and function calling

All LLM requests through Prompt Keeper are routed via LiteLLM, allowing you to use any LLM provider supported by LiteLLM while maintaining a consistent interface and comprehensive conversation history.

### LiteLLM Configuration File 🎛️

Prompt Keeper uses a LiteLLM YAML config file — by default it looks for `config.litellm.yaml` in the project root. To customize:

1. Edit `config.litellm.yaml`:
   - **model_list**: array of provider entries:
     - `model_name`: pattern matching LiteLLM API requests.
     - `litellm_params`: settings passed to LiteLLM (e.g. `model`, `api_key`, `api_base`, `provider`, `mock_response`, etc.).
   - **general_settings**: top-level settings (e.g., `store_model_in_db: false`).

## Authentication 🔒

Prompt Keeper uses three authentication methods:

1.  **UI Authentication**: Secure authentication using **Better Auth**.
    -   **First Run**: The first user to sign up becomes the **Admin**. Subsequent signups are disabled by default.
    -   **Passkeys**: Supports secure passwordless login with Passkeys (TouchID, FaceID, etc.).
    -   **Environment Variables**:
        -   `BETTER_AUTH_SECRET`: A secure random string for signing session cookies.
        -   `BETTER_AUTH_URL`: The full URL of your application (e.g., `http://localhost:3000`).
        -   `ENABLE_SIGNUP`: Set to `true` to allow additional users to sign up (default: `false`).

2.  **LiteLLM API Authentication**: For LLM API routes (`/api/chat/completions`, `/api/completions`, `/api/models`).

    -   Uses LiteLLM's authentication mechanism
    -   Configure through LiteLLM environment variables (e.g., `LITELLM_MASTER_KEY`)

3.  **Prompt Keeper API Authentication**: For all other API routes (e.g., `/api/search`).
    -   Set `PROMPT_KEEPER_API_KEY` in your `.env` file.
    -   Include the API key in your requests using the custom header:

        ```
        X-Prompt-Keeper-API-Key: your-api-key
        ```

## Contributing 🤝

We welcome contributions! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) file for details.

## License 📜

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
