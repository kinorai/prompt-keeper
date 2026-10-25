## [0.13.1](https://github.com/kinorai/prompt-keeper/compare/v0.13.0...v0.13.1) (2026-10-25)


### Bug Fixes

* **docker:** code review of the node 24 bump ([dd733cc](https://github.com/kinorai/prompt-keeper/commit/dd733ccdaf65e11bd07a80cdb8e2e27c457904c6))
* **docker:** node 24.22.1 lts, pinned by digest ([46f3a8b](https://github.com/kinorai/prompt-keeper/commit/46f3a8b137f3d3b7cea2f69a7a255dd5b506374d))

## [0.13.0](https://github.com/kinorai/prompt-keeper/compare/v0.12.2...v0.13.0) (2026-10-24)


### Features

* **search:** search in Postgres, OpenSearch optional ([f00f6e2](https://github.com/kinorai/prompt-keeper/commit/f00f6e2729d07175c084d868e802fcfc3a68ba5a))


### Bug Fixes

* **deps:** clear the high npm audit advisories ([a27f248](https://github.com/kinorai/prompt-keeper/commit/a27f248013173a05e7220420d428f77f31768e32))
* **search:** code review fixes ([8f9bc1c](https://github.com/kinorai/prompt-keeper/commit/8f9bc1cade898ba1212ab7c262ef8012068aa441))
* **search:** find words past the indexed 256K characters of long messages ([490294f](https://github.com/kinorai/prompt-keeper/commit/490294f0dc3a69e6e9879381af000fb4e4a716c0))

## [0.12.2](https://github.com/kinorai/prompt-keeper/compare/v0.12.1...v0.12.2) (2026-10-22)


### Bug Fixes

* **api:** return generic errors to clients and log the details ([7eceafd](https://github.com/kinorai/prompt-keeper/commit/7eceafd7b320f482c264e6d63b3ef9fe6ac02f30))
* **auth:** apply code review: no session refresh in routes, LiteLLM key order, verified inline images ([1a60270](https://github.com/kinorai/prompt-keeper/commit/1a60270e4f31b0c95bb6ae3318071a981e1255ff))
* **auth:** undo first-user signups that race the user count ([e4cbb72](https://github.com/kinorai/prompt-keeper/commit/e4cbb7255af92925fe957d3b39189d8910453fa2))
* **auth:** validate the session instead of trusting cookie presence ([4b544df](https://github.com/kinorai/prompt-keeper/commit/4b544df133b60ccb5170c26a75d35d7f9bccbdc1))
* **chat:** cancel the upstream stream when the client disconnects ([3ba3030](https://github.com/kinorai/prompt-keeper/commit/3ba303083f5deebcb8d7894264e85da6c33c5dbd))
* **chat:** scope conversation matching to the caller's key ([97749f5](https://github.com/kinorai/prompt-keeper/commit/97749f54fc43f4256c8a277343e624d63c7e705e))
* **images:** accept only raster image types from data: URLs ([a341fde](https://github.com/kinorai/prompt-keeper/commit/a341fdee8e15774eb948f673f2788af47de94367))
* **images:** only server-uploaded s3:// keys are stored; delete skips shared keys ([809d443](https://github.com/kinorai/prompt-keeper/commit/809d4436cf50d818c5c1c6919f5ba3351fe856c4))
* **markdown:** load markdown images only from data: and same-origin URLs ([e845df8](https://github.com/kinorai/prompt-keeper/commit/e845df809d1a3c15658d474fc3122ae1e4017f86))
* **markdown:** restore Streamdown's sanitizer and render highlights ([5ebd1b2](https://github.com/kinorai/prompt-keeper/commit/5ebd1b23f31621b9763d21c1dd20d29ccaa4c424))
* **outbox:** cap retries, dead-letter poison events, delete images ([39ac99c](https://github.com/kinorai/prompt-keeper/commit/39ac99cdddec593628e8d617dda6b14b06fdebb5))
* **outbox:** retry outages forever with backoff, dead-letter only OpenSearch rejections ([f02d2cb](https://github.com/kinorai/prompt-keeper/commit/f02d2cbc4637768fb65169c06104b69f503ef25f))
* **proxy:** check the session without refreshing it in the database ([6bf04a6](https://github.com/kinorai/prompt-keeper/commit/6bf04a61fd82e277360c1a5290bc85ba1a430fc4))
* **quickstart:** ship placeholders, not working secrets, and keep services local ([1139ec9](https://github.com/kinorai/prompt-keeper/commit/1139ec9054caac07f15f29b4ae1daab12c52c9a8))
* **search:** accept numeric strings and any-case roles; out-of-range size/from return 400 ([39a299a](https://github.com/kinorai/prompt-keeper/commit/39a299a38edebb214317a0069ff837e8ab292729))
* **search:** bound size and from, validate roles and filters ([e6583bf](https://github.com/kinorai/prompt-keeper/commit/e6583bf54bc9fafc9cbfc64a4d28a880dc942727))
* **ui:** don't auto-load external image URLs from stored messages ([8532c43](https://github.com/kinorai/prompt-keeper/commit/8532c43e7a9c6af4c9ddf0097afae219d935a1f1))

## [0.12.1](https://github.com/kinorai/prompt-keeper/compare/v0.12.0...v0.12.1) (2026-08-22)

## [0.12.0](https://github.com/kinorai/prompt-keeper/compare/v0.11.0...v0.12.0) (2026-07-29)


### Features

* **deploy:** ship a dedicated database migration runner image ([8c77dc6](https://github.com/kinorai/prompt-keeper/commit/8c77dc63579aad469654f6f1887f17530e4ea7f5))

