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
   ```

2. Generate a secure password hash for the admin user and add it to the .env file:
   ```bash
   htpasswd -bnBC 12 "" "your_password_here" | tr -d ':\n'
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

## Authentication 🔒

Prompt Keeper uses three authentication methods:

1.  **UI Authentication**: Username and password-based authentication for the web interface.

    -   Set `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` in your `.env` file.
    -   Use the `openssl passwd` command to generate a secure password hash.
    -   Example: `openssl passwd -apr1`

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
