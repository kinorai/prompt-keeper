Below is the Design Architecture Template (DAT) for Prompt Keeper.

────────────────────────────────────────
Prompt Keeper - Design Architecture Template (DAT)
────────────────────────────────────────

1. OVERVIEW

• Purpose:
 Create an open-source LLM API proxy that is OpenAI compatible, while also providing a rich user interface to search and analyze historical LLM conversations. The system intercepts API calls, forwards them to LiteLLM for processing, and stores the resulting conversation data in OpenSearch.

• Primary Goals:

- Provide an API proxy to route requests to LiteLLM.
- Log and store conversation details (metadata, token usage, messages, etc.) asynchronously.
- Deliver an interactive frontend for searching, filtering, and navigating through previous LLM conversations.

──────────────────────────────────────── 2. OBJECTIVES & FEATURES

1. OpenAI Compatible API Proxy with Conversation Storage in OpenSearch

   - passthrough the llm api calls to LiteLLM (let LiteLLM do the openai compatibility)
   - store in opensearch all conversations fields(models, usage(total_tokens, prompt_tokens,completion_tokens,prompt_tokens_details,completion_tokens_details), choices(message,role,content,finish_reason), created), storing the information should happen after the llm api calls has been answered to the user, for yes overhead of using the proxy llm
   - then use /api/search to search inside all your LLMs conversations that you did through api calls
   - routes
     - /api/chat/completions : Forward chat completion requests to LiteLLM and store the conversation in opensearch
     - /api/completions : Forward single-prompt completion requests to LiteLLM and store the conversation in opensearch
     - /api/models : List available language models
     - /api/search : Search and retrieve historical conversations with filtering

2. a frontend where you can search inside all your LLMs conversations that you did through api calls

──────────────────────────────────────── 3. TECHNOLOGY STACK

• Frontend:

- Next.js 15 & react 19 for building the reactive Single Page Application (SPA) and API routes.
- UI libraries such as Shadcn UI and components from 21st.dev for a modern, responsive design.
- Tailwind CSS for styling.

• Backend & Proxy:

- Next.js API routes acting as middleware to forward API calls to LiteLLM.
- LiteLLM to handle LLM processing and ensure OpenAI compatibility.

• Data Storage & Search:

- OpenSearch 2.18.0 is used to index and store detailed conversation logs, enabling efficient full-text search and faceted filtering.

──────────────────────────────────────── 4. SYSTEM ARCHITECTURE

A. High-Level Data Flow

1. A user (or external client) sends a request (e.g., a chat completion call) to the Next.js API proxy endpoint. 2. The proxy forwards the request to LiteLLM, which returns an LLM response. 3. The proxy immediately returns the LLM response to the user. 4. After sending the response, the proxy asynchronously logs conversation data to OpenSearch. 5. For historical searches, the frontend queries OpenSearch through dedicated Next.js API route that return filtered and ranked conversation data.

B. Architecture Diagram

[Frontend UI (Next.js + Shadcn/21st.dev)]
│
▼
[Next.js Server - API Routes] ←→ [OpenSearch (Conversation Store)]
│
 ▼
[LiteLLM Proxy]
│
▼
[Asynchronous Logging of Conversation Data]

──────────────────────────────────────── 6. SECURITY & AUTHENTICATION

• Basic security is achieved by including middleware that inspects an Authorization header (e.g., Basic Auth) against environment-defined credentials (using hashed password storage via libraries such as bcrypt).
• This protects both the API proxy endpoints and the administrative UI.
• Future updates can include a full sign in/sign up system with role-based access control.

---

You are an expert in TypeScript, Node.js, Next.js App Router, React, Shadcn UI, Radix UI and Tailwind.

## Code Style and Structure

- Write concise, technical TypeScript code with accurate examples.
- Use functional and declarative programming patterns; avoid classes.
- Prefer iteration and modularization over code duplication.
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError).
- Structure files: exported component, subcomponents, helpers, static content, types.
- Ignore linting errors as last resort.

## UI and Styling

- Use Shadcn UI, Radix, and Tailwind for components and styling.
- Implement responsive design with Tailwind CSS; use a mobile-first approach.
- imports the shadcn/ui components from "@/components/ui".

## TypeScript Usage

- Use TypeScript for all code; prefer interfaces over types.
- Avoid enums; use maps instead.
- Use functional components with TypeScript interfaces.

## Performance Optimization

- Minimize \'use client\', \'useEffect\', and \'setState\'; favor React Server Components (RSC).
- Wrap client components in Suspense with fallback.
- Use dynamic loading for non-critical components.
- Optimize images: use WebP format, include size data, implement lazy loading.

## Key Conventions

- Use \'nuqs\' for URL search parameter state management.
- Optimize Web Vitals (LCP, CLS, FID).
- Limit \'use client\':
  - Favor server components and Next.js SSR.
  - Use only for Web API access in small components.
  - Avoid for data fetching or state management.

## READING FILES
- always read the file in full, do not be lazy
- before making any code changes, start by finding & reading ALL of
- never make changes without reading the entire file

## TESTING
- `npm run test`

## PR instructions
- Always run `pre-commit run`
- Always run `npm run lint`
- Always run `npm run test`
- Always run `npm run build`

## Debug

- Do not add debug buttons in the UI, or debug api routes, just use console.debug
- Do not add any debug code or files, just use console.debug

## EGO
- do not make assumption. do not jump to conclusions.
- you are just a Large Language Model, you are very limited.
- always consider multiple different approaches, just like a Senior

Follow Next.js docs for Data Fetching, Rendering, and Routing.

IMPORTANT:
- try to fix things at the cause, not the symptom.
- when you delete code, check if dependencies are not needed anymore.
- Default values should be in the src/lib/defaults.ts file.
