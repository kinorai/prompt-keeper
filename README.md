# Prompt Keeper

Prompt Keeper is an open-source LLM API proxy that is OpenAI compatible, providing a rich user interface to search and analyze historical LLM conversations. The system intercepts API calls, forwards them to LiteLLM for processing, and stores the resulting conversation data in OpenSearch.

## Getting Started

First, set up your environment variables:

```bash
cp .env.example .env
```

Then, generate a hashed password for authentication:

```bash
npm run generate-password
```

Add the generated hash to your `.env` file as `AUTH_PASSWORD_HASH`.

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Authentication

Prompt Keeper uses three authentication methods:

1. **UI Authentication**: Username and password-based authentication for the web interface.

   - Set `AUTH_USERNAME` and `AUTH_PASSWORD_HASH` in your `.env` file.
   - Use the `npm run generate-password` script to generate a secure password hash.

2. **LiteLLM API Authentication**: For LLM API routes (`/api/chat/completions`, `/api/completions`, `/api/models`).

   - Uses LiteLLM's authentication mechanism
   - Configure through LiteLLM environment variables (e.g., `LITELLM_MASTER_KEY`)

3. **Prompt Keeper API Authentication**: For all other API routes (e.g., `/api/search`).
   - Set `PROMPT_KEEPER_API_KEY` in your `.env` file.
   - Include the API key in your requests using the custom header:
     ```
     X-Prompt-Keeper-API-Key: your-api-key
     ```

## Features

- OpenAI-compatible API proxy that routes requests to LiteLLM
- Conversation storage in OpenSearch
- Interactive frontend for searching and filtering conversations
- Separate authentication for LLM API and management API

## Learn More

To learn more about the technologies used in this project:

- [Next.js Documentation](https://nextjs.org/docs)
- [OpenSearch Documentation](https://opensearch.org/docs/latest/)
- [LiteLLM Documentation](https://docs.litellm.ai/)

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
