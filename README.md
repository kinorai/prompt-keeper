# Prompt Keeper
### **Never lose a single LLM conversation again!**

**Prompt Keeper** is an open-source LLM API proxy providing a **rich user interface to search and analyze historical LLM conversations**. The system intercepts API calls, **forwards them to LiteLLM** for processing, and stores the resulting conversation data in **OpenSearch**. It is fully **OpenAI compatible**.

## Features 🌟

-   😌 **Interactive frontend** for searching and filtering conversations
-   🧠 **Conversation storage** in OpenSearch
-   ✅ **OpenAI-compatible API** proxy that routes requests to LiteLLM

## How to Install 🚀

1. Download the docker-compose.yml and .env:
   ```bash
   curl -O https://raw.githubusercontent.com/kinorai/prompt-keeper/main/docker-compose.yml
   curl -o .env https://raw.githubusercontent.com/kinorai/prompt-keeper/main/.env.example
   curl -o config.litellm.yaml https://raw.githubusercontent.com/kinorai/prompt-keeper/main/files/config.example.litellm.yaml
   ```

2. Generate a secure, salted APR1-MD5 password hash for the admin user and add it to the `.env` file. For example:
   ```bash
   openssl passwd -apr1 "your_password_here" | sed 's/\$/\\$/g'
   ```

3. Start the services:
   ```bash
   docker-compose up -d
   ```

4. Access the UI at http://localhost:3000

### Available Docker Tags

- `kinorai/prompt-keeper:latest` - Latest release
- `kinorai/prompt-keeper:vx.y.z` - Specific version (see [releases page](https://github.com/kinorai/prompt-keeper/releases) for available versions)

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

1.  **UI Authentication**: Secure authentication with password hashing and JWT tokens.

    -   Set the following environment variables in your `.env` file:
        -   `AUTH_USERNAME`: The desired username for the UI login.
        -   `AUTH_PASSWORD_HASH`: The APR1-MD5 hash of the desired password. Generate this using the openssl command shown in the installation steps (e.g., `openssl passwd -apr1 "your_password_here" | sed 's/\$/\\$/g'`).
        -   `ACCESS_TOKEN_SECRET`: A long, random, secret string used for signing access tokens (15m expiry).
        -   `REFRESH_TOKEN_SECRET`: A long, random, secret string used for signing refresh tokens (7d expiry).
        -   `JWT_SECRET`: (Optional) Can be used as fallback for ACCESS_TOKEN_SECRET if not set.

2.  **LiteLLM API Authentication**: For LLM API routes (`/api/chat/completions`, `/api/completions`, `/api/models`).

    -   Uses LiteLLM's authentication mechanism
    -   Configure through LiteLLM environment variables (e.g., `LITELLM_MASTER_KEY`)

3.  **Token Refresh**: The refresh endpoint at `/api/auth/refresh` allows clients to obtain new access tokens using valid refresh tokens.

4.  **Prompt Keeper API Authentication**: For all other API routes (e.g., `/api/search`).
    -   Set `PROMPT_KEEPER_API_KEY` in your `.env` file.
    -   Include the API key in your requests using the custom header:

        ```
        X-Prompt-Keeper-API-Key: your-api-key
        ```

### CORS Configuration

For browser-based access to the API (e.g., from a frontend application), you must configure the allowed origins. Set the `CORS_ORIGIN` environment variable in your `.env` file to a comma-separated list of allowed origins (without spaces). Example:

```
CORS_ORIGIN="example.com,another.com"
```

This ensures that only requests from these origins will be allowed by the browser.

## Contributing 🤝

We welcome contributions! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) file for details.

## License 📜

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
