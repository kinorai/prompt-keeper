# Prompt Keeper

Prompt Keeper is an open-source LLM API proxy that is OpenAI compatible, providing a rich user interface to search and analyze historical LLM conversations. The system intercepts API calls, forwards them to LiteLLM for processing, and stores the resulting conversation data in OpenSearch.

## Getting Started

First, set up your environment variables:

```bash
cp .env.example .env
```

Then, generate a hashed password for authentication using `openssl`:

```bash
openssl passwd
```

Copy the generated hash and add it to your `.env` file as `AUTH_PASSWORD_HASH`.

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Authentication

Prompt Keeper uses three authentication methods:

1.  **UI Authentication**: Username and password-based authentication for the web interface.

    -   Set `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` in your `.env` file.
    -   Use the `openssl passwd` command to generate a secure password hash.

2.  **LiteLLM API Authentication**: For LLM API routes (`/api/chat/completions`, `/api/completions`, `/api/models`).

    -   Uses LiteLLM's authentication mechanism
    -   Configure through LiteLLM environment variables (e.g., `LITELLM_MASTER_KEY`)

3.  **Prompt Keeper API Authentication**: For all other API routes (e.g., `/api/search`).
    -   Set `PROMPT_KEEPER_API_KEY` in your `.env` file.
    -   Include the API key in your requests using the custom header:

        ```
        X-Prompt-Keeper-API-Key: your-api-key
        ```

## Features

-   OpenAI-compatible API proxy that routes requests to LiteLLM
-   Conversation storage in OpenSearch
-   Interactive frontend for searching and filtering conversations
-   Separate authentication for LLM API and management API

## Learn More

To learn more about the technologies used in this project:

-   [Next.js Documentation](https://nextjs.org/docs)
-   [OpenSearch Documentation](https://opensearch.org/docs/latest/)
-   [LiteLLM Documentation](https://docs.litellm.ai/)

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

-   [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
-   [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Development

### Versioning and Docker Publishing

This project uses GitHub Actions for automated versioning and Docker image publishing:

- When changes are pushed to the `main` branch, a GitHub Action automatically:
  - Bumps the version number (patch by default)
  - Creates a new tag in the format `x.y.z` (without 'v' prefix)
  - Updates the version in package.json
  - Builds and pushes Docker images to Docker Hub with tags:
    - `kinorai/prompt-keeper:latest`
    - `kinorai/prompt-keeper:x.y.z` (the specific version)

This ensures that the Docker images are always up-to-date with the latest changes in the main branch.

#### Required GitHub Secrets

To enable Docker image publishing, you need to set up the following secrets in your GitHub repository:

- `DOCKERHUB_USERNAME`: Your Docker Hub username
- `DOCKERHUB_TOKEN`: A Docker Hub access token with push permissions

You can add these secrets in your GitHub repository under Settings > Secrets and variables > Actions.

## Docker Deployment

### Using Docker Compose

The easiest way to deploy Prompt Keeper is using Docker Compose:

1. Create a `.env` file with your configuration (see the Authentication section above)
2. Run the following command:

```bash
docker compose up -d
```

This will start Prompt Keeper along with OpenSearch and LiteLLM services. The application will be available at http://localhost:3000.

### Using Docker Run

You can also run the Prompt Keeper container directly:

```bash
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e OPENSEARCH_URL=http://your-opensearch-host:9200 \
  -e LITELLM_URL=http://your-litellm-host:4000 \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD_HASH=your_password_hash \
  -e PROMPT_KEEPER_API_KEY=your_api_key \
  kinorai/prompt-keeper:latest
```

Replace the environment variables with your actual configuration.

### Available Docker Tags

- `kinorai/prompt-keeper:latest` - Latest stable release
- `kinorai/prompt-keeper:x.y.z` - Specific version (e.g., 0.1.0)
- `kinorai/prompt-keeper:x.y` - Latest patch version of a specific minor version

### Building Your Own Image

You can build your own Docker image using the provided Dockerfile:

```bash
docker build -t your-org/prompt-keeper:your-tag .
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
