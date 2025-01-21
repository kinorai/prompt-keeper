PROMPT 1:
```
CONTEXT:

i want to use litellm as a llm router, the main goal is to save all my prompts so i can consult them and save them
I want it to be as lightweight and simple as possible
I want first the llm to answer the api call as fast as possible
then once the answer is done it should store the prompt, answer, system prompt, date, etc in postgres
i need fuzzysearch to search in prompts and responses USE https://github.com/seatgeek/thefuzz server side

INSTRUCTIONS:
Create a front for the api described in the context, modify python api if necessary
features:
- user should be able to custom query with components : query, min_score and limit 
- user should be able to search all or any data he wants with components :timestamp, model, messages, response, raw_response, total_tokens, latency_ms, default searches those : timestamp messages response
- make a beautiful UI for all data and allow user to see raw_response with beautiful json  with colors display when he clicks a ui component, user messages and AI responses should be the most visible data because it is the most important for the user, messages and responses should display as markdown
- search should start displaying after user typed 3 characters or more, and after that every character should refresh query
- number of results and how much time query time should be displayed
- keep state of the result and the search text in the input in browser, i don't want to lose my search query and the result
- add a shadcn logo in search bar
- add the possiblity to limit search to hours, days, month, years
```

PROMPT 2:
```
actually front searches api POST /search 404 in 32ms

But api i they given python file

so it should querry @http://0.0.0.0:8000 /search  
```

PROMPT 3:
```
darkmode does not work, i want to be able to toggle it on off
```
PROMPT 4:
```
try to put all those informations on the same line to gain space
Raw Response button, Tokens: 32 | Latency: 886ms | Match: 100%
, 12/25/2024, 10:36:33 AM
chatgpt-4o-latest
```

PROMPT 5:
```
```
---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
