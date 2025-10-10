Prompt Keeper
1. OVERVIEW

• Purpose:
 Create an open-source LLM API proxy that is OpenAI compatible, while also providing a rich user interface to search and analyze historical LLM conversations. The system intercepts API calls, forwards them to LiteLLM for processing, and stores the resulting conversation data in Postgres (single source of truth) and OpenSearch.

2. TECHNOLOGY STACK

• Frontend:

- Next.js & react for building the reactive Single Page Application (SPA) and API routes.
- UI libraries such as Shadcn UI and components from 21st.dev for a modern, responsive design.
- Tailwind CSS for styling.

• Backend & Proxy:

- Next.js API routes acting as middleware to forward API calls to LiteLLM.
- LiteLLM to handle LLM processing and ensure OpenAI compatibility.

• Data Storage & Search:

- Postgres is used to store the single source of truth and all the stored data.
- OpenSearch is used to index and store detailed conversation logs, enabling efficient full-text search and faceted filtering.

3. SYSTEM ARCHITECTURE

A. Architecture Diagram

[Frontend UI (Next.js + Shadcn/21st.dev)]
│
▼
[Next.js Server - API Routes] ←→ [Postgres (Conversation Store)] ←→ [OpenSearch (Conversation Store)] ←→ [Outbox Worker]
│
 ▼
[LiteLLM Proxy]
│
▼
[Asynchronous Logging of Conversation Data] ←→ [Outbox Worker]

---

You are an expert in TypeScript, Node.js, Next.js App Router, React, Shadcn UI, Radix UI and Tailwind.

## Code Style and Structure

- Write concise, technical TypeScript code with accurate examples.
- Use functional and declarative programming patterns; avoid classes.
- Prefer iteration and modularization over code duplication. DRY!
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError).
- Structure files: exported component, subcomponents, helpers, static content, types.
- Ignore linting errors as last resort.

## UI and Styling

- Use Shadcn UI, Radix, and Tailwind for components and styling.
- Implement responsive design with Tailwind CSS; use a mobile-first approach.
- imports the shadcn/ui components from "@/components/ui".
- WHEN USING SHADCN UI, ALWAYS INSTALL THE COMPONENTS WITH THE APPROPRIATE COMMAND, DON'T WRITE IT MANUALLY

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
