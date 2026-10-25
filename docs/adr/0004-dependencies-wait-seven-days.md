# ADR 0004: Dependencies wait 7 days after a release

- **Status:** proposed (PR #178, not merged). The `.npmrc` delay and the GitHub Actions
  and Docker cooldowns are already on `main`; PR #178 adds the npm Dependabot cooldown.
- **Date:** 2026-10-24
- **Scope:** `.npmrc`, `.github/dependabot.yml`

## Context

A hijacked maintainer account or a poisoned release usually ships malicious code that
is found and pulled within days. A project that takes every release the minute it is
published installs it in that window. Prompt Keeper holds API keys and every LLM
conversation that passes through it, so a compromised dependency would see all of it.

Before PR #178, the repo had part of a delay:

- `.npmrc` sets `min-release-age=7` (npm 11.10.0 or later): npm resolves only versions
  published at least 7 days ago.
- Dependabot's `github-actions` and `docker` entries had a 7-day cooldown.
- The `npm` entry had none of its own, so it got GitHub's default 3-day cooldown:
  Dependabot could propose a release 3 days after it was published, one that
  `npm install` itself would refuse for 4 more days.

## Decision

Every dependency waits **7 days** after its release before it lands here:

- **npm installs:** `min-release-age=7` in `.npmrc`.
- **Dependabot version updates:** `cooldown: default-days: 7` on every ecosystem,
  `npm` included. 7 days, not GitHub's default of 3, to match `.npmrc`.
- **Security fixes may bypass it:**
  - Dependabot security updates ignore the cooldown.
  - `min-release-age` also applies to `npm audit fix`: it picks the newest patched
    version that is old enough. When the fix itself is newer than 7 days, a one-off
    `npm install --min-release-age=0` pins it in the lockfile, and `npm ci` does not
    apply the setting.
  - Dependabot has no security updates for Docker images, so an urgent Node CVE is
    bumped by hand.

## Consequences

- A release that is pulled within a week never reaches this repo through routine
  updates.
- Routine updates arrive a week late, including their bug fixes. For example, PR #178
  takes better-auth 1.7.10, the newest release older than 7 days, while 1.7.11 and
  1.7.12 were 5 and 4 days old.
- `npm ci` installs what the lockfile holds, whatever its age, so the delay applies
  when the lockfile changes, not when it is installed.
- A security fix skips the Dependabot cooldown. When the fix is less than 7 days old,
  `min-release-age` still holds it back until the one-off override above pins it.
