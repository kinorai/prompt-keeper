# ADR 0003: The breached-password check fails closed

- **Status:** proposed (PR #178, not merged)
- **Date:** 2026-10-24
- **Scope:** email and password auth (`src/lib/auth.ts`), `PASSWORD_BREACH_CHECK`

## Context

Email and password sign-up uses Better Auth's default rules: 8 characters minimum, no
other check. A user could set a password that is in every credential-stuffing list,
and Prompt Keeper stores every LLM conversation that goes through it.

Better Auth ships a `haveIBeenPwned()` plugin. It checks a new password against the
Have I Been Pwned range API with k-anonymity: only the first 5 hex characters of the
password's SHA-1 leave the server, and the response is padded (`Add-Padding: true`).
The plugin has no fail-open option: if `api.pwnedpasswords.com` cannot be reached, the
request fails with a 500 ("Failed to check password").

## Decision

New passwords are checked, and the check **fails closed**:

- **Where:** sign-up, password change and password reset. Sign-in never calls the API.
  The sign-up gate (`ENABLE_SIGNUP`) runs first, so a refused sign-up sends nothing.
- **A breached password:** the request is refused with `400 PASSWORD_COMPROMISED`.
- **The API unreachable:** the request fails with a 500, and no password is set. On a
  sign-up, no user row is created.
- **Turning it off:** `PASSWORD_BREACH_CHECK=false`, for an install without internet
  access. The default is on.

Fail closed was kept on purpose. A fail-open check is skipped by anyone who can block
the egress, and the paths it guards are rare: a first sign-up, a password change.

Checked on PR #178 against a throwaway Postgres 17 with every migration applied:

| Case | Result |
|---|---|
| Sign-up with a unique password | ok |
| Change to `password123` | 400 `PASSWORD_COMPROMISED` |
| Sign-up with `password123` | 400 `PASSWORD_COMPROMISED` |
| `PASSWORD_BREACH_CHECK=false` | ok |
| API unreachable (the fetch throws) | 500, no user row created |

## Consequences

- **Deploy order:** a deployment needs HTTPS egress to `api.pwnedpasswords.com:443`
  before it runs this version. Behind a default-deny network policy, allow it first;
  otherwise first sign-ups and password changes fail. Sign-in keeps working either way.
- **An outage of the API blocks** sign-ups and password changes until it is back, or
  until `PASSWORD_BREACH_CHECK=false` is set.
- **Privacy:** the API sees 5 hex characters of a SHA-1 and the server's IP address on
  each checked request, never the password.
- **Air-gapped installs** must set `PASSWORD_BREACH_CHECK=false`. PR #178 documents
  it in the README and `.env.example`.
