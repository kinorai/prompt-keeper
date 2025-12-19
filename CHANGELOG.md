## [0.8.0](https://github.com/kinorai/prompt-keeper/compare/v0.7.2...v0.8.0) (2025-12-19)


### Features

* **opensearch:** init is done automatically on startup ([84514c9](https://github.com/kinorai/prompt-keeper/commit/84514c9b639eb9a7c349e73bec533ec5d0fc3382))

## [0.7.2](https://github.com/kinorai/prompt-keeper/compare/v0.7.1...v0.7.2) (2025-12-18)

## [0.7.1](https://github.com/kinorai/prompt-keeper/compare/v0.7.0...v0.7.1) (2025-12-18)

## [0.7.0](https://github.com/kinorai/prompt-keeper/compare/v0.6.0...v0.7.0) (2025-12-03)


### Features

* increase fuzzy ness minimum lenght ([a0e3c41](https://github.com/kinorai/prompt-keeper/commit/a0e3c4141bc420c935ce1dad017cb9f8b03839d8))
* remove fuzziness from gaic search ([3fb037d](https://github.com/kinorai/prompt-keeper/commit/3fb037df6b2d50cfc3e78b1ad9b7a1ee55f86b95))

## [0.6.0](https://github.com/kinorai/prompt-keeper/compare/v0.5.0...v0.6.0) (2025-12-01)


### Features

* add comprehensive API test coverage, update Next.js image and ESLint configuration, and improve type safety for multimodal content ([447af62](https://github.com/kinorai/prompt-keeper/commit/447af62dacb318986eb7d764f752a77dfc34caa4))
* add HTTP health server with liveness and readiness probes to the outbox worker and expose its port ([ab6d208](https://github.com/kinorai/prompt-keeper/commit/ab6d20841e6df55e3187e095e49bbdb512bbae60))
* add outbox worker Dockerfile and update CI to build multiple images ([a2c0e01](https://github.com/kinorai/prompt-keeper/commit/a2c0e01fd63dba9eba68c35493caf42b086ee153))
* adjust search fuzziness setting ([ebeb193](https://github.com/kinorai/prompt-keeper/commit/ebeb1939a8d2c126ec3a58ac6c28510e8e36437a))
* extend refresh token expiration from 7 days to 14 days for improved user session management ([f94e1ad](https://github.com/kinorai/prompt-keeper/commit/f94e1ade1586cf2d57aae53dd828961c14e1b4df))
* highlight bold black ([8ad6d25](https://github.com/kinorai/prompt-keeper/commit/8ad6d2587a4f07d6c388e52c9a53a3e6cf9221be))
* highlight of searched text ([e168f98](https://github.com/kinorai/prompt-keeper/commit/e168f986d8c5fe360747a19c9a332e17ecab333b))
* images and docs in s3 ([acf876b](https://github.com/kinorai/prompt-keeper/commit/acf876b9ed5a84626e7db3d6d112a421f951d714))
* integrate Postgres as the primary data store and implement outbox worker for asynchronous syncing to OpenSearch ([6a1ce30](https://github.com/kinorai/prompt-keeper/commit/6a1ce301a71c1e172ace356cdb2a0ccb2acb0930))
* magic search with filters and operators ([d8a9ba3](https://github.com/kinorai/prompt-keeper/commit/d8a9ba3ee7d01e9709c160ff9a10b9fc79f60edc))
* make OpenSearch index name configurable, update its default ([13633ee](https://github.com/kinorai/prompt-keeper/commit/13633eea6288eb1435d50958b2315dacbcd046d2))
* migrate authentication system to better-auth with passkey support and consolidate auth routes ([b2af8eb](https://github.com/kinorai/prompt-keeper/commit/b2af8eb0046b3e2f71d5db476c18100858d36de2))
* remove undo delete conv toast ([76b10ac](https://github.com/kinorai/prompt-keeper/commit/76b10ac388683a3b93e0248c8ecce119ed035c1a))


### Bug Fixes

* **auth:** login loop bug better auth ([bfcdd65](https://github.com/kinorai/prompt-keeper/commit/bfcdd65e64d457662e7154bef074936af5be339b))
* wrong date in open search for conversation creation now use created_at ([2fb1722](https://github.com/kinorai/prompt-keeper/commit/2fb17222ebe194fbbc568c18b2a0003080833f8f))

