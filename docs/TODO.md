# TODO

Deferred work, with the reason it waits.

## Build

- **One `prisma generate` per Docker build.** The Dockerfiles copy the Prisma
  schema and `prisma.config.ts` before `npm ci` only so the postinstall
  `prisma generate` can run. Every schema edit then forces a full dependency
  reinstall, and generate runs twice per build. Fix: `npm ci --ignore-scripts`
  plus one explicit `prisma generate` step after the sources are copied. It
  changes install behaviour, so test it on its own (amd64 and arm64 builds).

- **Drop the TypeScript 7 hold.** `.github/dependabot.yml` ignores TypeScript
  majors and `package.json` pins `~6.0.3`: TypeScript 7 has no JavaScript API,
  so typescript-eslint (typescript-eslint/typescript-eslint#10940) and ts-jest
  cannot load it. Once both support 7, remove the ignore rule and let
  Dependabot bump it.
