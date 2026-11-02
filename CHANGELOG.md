## [0.14.2](https://github.com/kinorai/prompt-keeper/compare/v0.14.1...v0.14.2) (2026-11-02)


### Bug Fixes

* **api:** apply the code review of [#187](https://github.com/kinorai/prompt-keeper/issues/187) ([1b470fc](https://github.com/kinorai/prompt-keeper/commit/1b470fcde3af5333b827567c4bf5b2d4719a25c7))
* **api:** stop forwarding the session cookie and api key to litellm ([0a75aa1](https://github.com/kinorai/prompt-keeper/commit/0a75aa1b34464f2844d31c19d89ebb57cbb4507a))
* **ci:** give the security workflow a read-only token by default ([e01d76a](https://github.com/kinorai/prompt-keeper/commit/e01d76a77fb9d102f207de57699b95c42d630eb0))
* **docker:** pin the outbox worker's esbuild to the lockfile version ([70d9fe7](https://github.com/kinorai/prompt-keeper/commit/70d9fe7e31045c6e0d41675b60e86b83c9aa291a))
* **search:** hand postgres iso 8601 dates for a custom time range ([ef37983](https://github.com/kinorai/prompt-keeper/commit/ef379830b619077de5e84be6b89c1ec42ed2964d))

## [0.14.1](https://github.com/kinorai/prompt-keeper/compare/v0.14.0...v0.14.1) (2026-10-25)

## [0.14.0](https://github.com/kinorai/prompt-keeper/compare/v0.13.1...v0.14.0) (2026-10-25)


### Features

* **auth:** reject breached passwords with Have I Been Pwned ([61adad9](https://github.com/kinorai/prompt-keeper/commit/61adad917f5f36c7e46d74ac780e5b77259f1576))


### Bug Fixes

* **deps:** bump better-auth and @better-auth/passkey to 1.7.10 ([237bb34](https://github.com/kinorai/prompt-keeper/commit/237bb34c039bb14c557bfb9cb3378035ab9c5baa))

## [0.13.1](https://github.com/kinorai/prompt-keeper/compare/v0.13.0...v0.13.1) (2026-10-25)


### Bug Fixes

* **docker:** code review of the node 24 bump ([c2eb231](https://github.com/kinorai/prompt-keeper/commit/c2eb2317e959cbcb23b6b31a4e4c770b56757d93))
* **docker:** node 24.22.1 lts, pinned by digest ([66ffb16](https://github.com/kinorai/prompt-keeper/commit/66ffb1602f27813092480ad5dfb8a7fcb5012324))

## [0.13.0](https://github.com/kinorai/prompt-keeper/compare/v0.12.2...v0.13.0) (2026-10-24)


### Features

* **search:** search in Postgres, OpenSearch optional ([83a7282](https://github.com/kinorai/prompt-keeper/commit/83a7282a3c77e3ff85bc5b5c2f40ad91c59384f1))


### Bug Fixes

* **deps:** clear the high npm audit advisories ([b946cc2](https://github.com/kinorai/prompt-keeper/commit/b946cc2bfcc0c731ace3eaa7e834d3c71e0d2424))
* **search:** code review fixes ([9fa1b0d](https://github.com/kinorai/prompt-keeper/commit/9fa1b0d2008643cc0633130b79063ce16d6f4568))
* **search:** find words past the indexed 256K characters of long messages ([80a1667](https://github.com/kinorai/prompt-keeper/commit/80a1667b8bf0969d959a9c9bfd47c1f556465d96))

