# [0.3.0](https://github.com/kinorai/prompt-keeper/compare/v0.2.0...v0.3.0) (2025-06-05)


### Bug Fixes

* click on header scroll to on desktop ([fe49795](https://github.com/kinorai/prompt-keeper/commit/fe49795a7d34c38c495425d6576628fcc9917328))
* div problem with rehypeSanitize from gemini ([cc0fad3](https://github.com/kinorai/prompt-keeper/commit/cc0fad3bdcc139ecbc5b111bf1c0992b04bdb9ab))


### Features

* completely rework logging with pino and increase timeout completion api to 8 min ([95c4c12](https://github.com/kinorai/prompt-keeper/commit/95c4c122a7e5c7206efc63b3bc6f0d3b31d4dc20))
* enhance CORS support ([fea9067](https://github.com/kinorai/prompt-keeper/commit/fea9067e8a70f7f44e2062b5b4e4848922a52758))
* implement rate limiting for login requests ([353419f](https://github.com/kinorai/prompt-keeper/commit/353419feee174e69c1dcc1432dbd0008e170cd3b))



# [0.2.0](https://github.com/kinorai/prompt-keeper/compare/v0.1.0...v0.2.0) (2025-05-31)


### Features

* implement access and refresh token authentication with JWT support ([43bdac3](https://github.com/kinorai/prompt-keeper/commit/43bdac329317dbc0bceaedc9a0a07a9f36e75815))



# [0.1.0](https://github.com/kinorai/prompt-keeper/compare/801ab4b26dd3ec7078b204ffad79ad80d01433c9...v0.1.0) (2025-05-23)


### Bug Fixes

* bug highlited text in code blocks ([46cc1c8](https://github.com/kinorai/prompt-keeper/commit/46cc1c87653b2788aba42c8292ff98d6903930e0))
* debounce query on input change ([b7e868b](https://github.com/kinorai/prompt-keeper/commit/b7e868ba7d57ddea3c50c3a7e01065abe55a52af))
* labeler config structure ([7d827ce](https://github.com/kinorai/prompt-keeper/commit/7d827ce57d31fd1af03fc2b378bad561b468bcb2))


### Features

* add all shadcn components and theme provider ([a724043](https://github.com/kinorai/prompt-keeper/commit/a7240433d4fc1e850577f18b53d021864baccd19))
* add authentification + deployment success ([037871b](https://github.com/kinorai/prompt-keeper/commit/037871b71566866e8057fc2dcc3cf8aca341a865))
* add copy buttons ([dc7172c](https://github.com/kinorai/prompt-keeper/commit/dc7172c12998c159bf9aeb32413cdd8a0f2848ab))
* add hash logic to update existing conversations ([383ae6b](https://github.com/kinorai/prompt-keeper/commit/383ae6b7a2b402792620ef46cc120f1af4dff962))
* add markdown support ([4e88d07](https://github.com/kinorai/prompt-keeper/commit/4e88d079f491a0f1205059a43db9c3a9d77c5b2f))
* completions openai compatible + search ([92dd51a](https://github.com/kinorai/prompt-keeper/commit/92dd51a7dcfef3016073cb9af9f5b2c5bac41a61))
* conversations display like a chat ([a83ee76](https://github.com/kinorai/prompt-keeper/commit/a83ee7675c66609805d79519ab63fba97bd34241))
* create dependabot.yml ([3edcb27](https://github.com/kinorai/prompt-keeper/commit/3edcb276bdc6a9a379fef8a6de91d52ed912c88b))
* dark mode toggle instead of drop down menu ([0414be5](https://github.com/kinorai/prompt-keeper/commit/0414be589462e4378118c411cd7428e73dbe13e3))
* default llm timeout to 5 minutes ([c74d2fb](https://github.com/kinorai/prompt-keeper/commit/c74d2fbad3ffc9498f774c1638c59da1ffcc707e))
* deployment of the stack ([fffc8cd](https://github.com/kinorai/prompt-keeper/commit/fffc8cd7821cb09707aa26969ab872164d337ece))
* docker compose with apr1 ([d47b821](https://github.com/kinorai/prompt-keeper/commit/d47b8218635e352c32e717e2c4c4e40585402b9d))
* empty search returns latest conversations ([4fc7eaa](https://github.com/kinorai/prompt-keeper/commit/4fc7eaaf11b204b1546e7ebf035ac2ce5c369d91))
* fixed header click to scroll top of conversation ([9ec35be](https://github.com/kinorai/prompt-keeper/commit/9ec35beaaff24e1e8abc11bec1349057a484a9bf))
* fuzzy order by score others order by date ([ecc7dc3](https://github.com/kinorai/prompt-keeper/commit/ecc7dc3cb7b2cd3bf1bf1fc8386617741624e4c1))
* highlight and fix of user message instead of assistant ([82dde96](https://github.com/kinorai/prompt-keeper/commit/82dde96bad21f38ccf2eb65bc44988e4eb98c44a))
* increase chat completion timeout to 2min ([d9a4858](https://github.com/kinorai/prompt-keeper/commit/d9a4858c21b0fe98d4577f216bee485229932df0))
* increase jwt expiration to 60d ([2b9f05f](https://github.com/kinorai/prompt-keeper/commit/2b9f05fc5684d8684e0ab45c85f9ea74c5dcdd16))
* initial commit ([801ab4b](https://github.com/kinorai/prompt-keeper/commit/801ab4b26dd3ec7078b204ffad79ad80d01433c9))
* initial empty nextjs repo ([a542a93](https://github.com/kinorai/prompt-keeper/commit/a542a93c85e7fbeb8330d856f49b53678e3ac18e))
* mobile option and search bar adjustment to optimise screen size ([56e067a](https://github.com/kinorai/prompt-keeper/commit/56e067a9144bbe5fa5f8fcd017af31a5074c764d))
* order fuzzy by score ([267e3fd](https://github.com/kinorai/prompt-keeper/commit/267e3fd4a4a181ac79f83c2437ad8ae4d891f974))
* reduce page size to 10 default and steps to 1 ([722086d](https://github.com/kinorai/prompt-keeper/commit/722086d09b9759e621364fea91ff1f55fe5b2fa5))
* refacto auth with md5 ([3edfd0b](https://github.com/kinorai/prompt-keeper/commit/3edfd0b09197b1bf10f8200f0f21ce0f00ab35b1))
* refacto front with claude 3.7 ([74d2814](https://github.com/kinorai/prompt-keeper/commit/74d28141ff161a783bd8655373066a415bd4fb2a))
* refacto highlight of searched words ([1e75c29](https://github.com/kinorai/prompt-keeper/commit/1e75c293623e1e112aef1e3caf23ad9e76ce98c6))
* remove authentification litellm routes ([d519c0e](https://github.com/kinorai/prompt-keeper/commit/d519c0e12817c1e00d9a7c357fd8f6959ffe2ddb))
* remove helm chart ([8d8501f](https://github.com/kinorai/prompt-keeper/commit/8d8501fc3d6cdbf776cb87830fd90c194996cf5b))
* remove highlight search query ([d2f8895](https://github.com/kinorai/prompt-keeper/commit/d2f88955d47bf01e7cd7649138f33bf3747a84c2))
* remove highlight searched word feature ([ecdae61](https://github.com/kinorai/prompt-keeper/commit/ecdae61f8e63933383c1a5afe7227017505836db))
* remove raw responses everywhere in code ([f8c060c](https://github.com/kinorai/prompt-keeper/commit/f8c060cbcaae656ad7bc820e955579fd2050aa4a))
* reset version to 0.1.0 ([a6b0af7](https://github.com/kinorai/prompt-keeper/commit/a6b0af7853d0887e8fc9def94dfd250f6d7105af))
* revert only version on pull request close ([080cc46](https://github.com/kinorai/prompt-keeper/commit/080cc46686b867dc559622b9c3c52621ff4fc798))
* rework timestamp nadge ([6f38149](https://github.com/kinorai/prompt-keeper/commit/6f381496c871d27ae51e93b9f641827fd2665a37))
* search for existing conversation over 1y only ([7beeb57](https://github.com/kinorai/prompt-keeper/commit/7beeb5715d45c2a086ce9276d9a44e0488ddf093))
* ui mobile and desktop adjustment ([ff240a1](https://github.com/kinorai/prompt-keeper/commit/ff240a1e313c50096cf6bb5279af69a3540478e8))
* use create-release action ([a05b446](https://github.com/kinorai/prompt-keeper/commit/a05b4469bc3a8fc26ab8dc191829c67bb05b7ae2))
* working api and search ([0737305](https://github.com/kinorai/prompt-keeper/commit/07373052590c34461b647beae2a3212dc835c2ca))
* working deployment with helm + fix lint issues ([6fc8da9](https://github.com/kinorai/prompt-keeper/commit/6fc8da9d6b8c0885a625cff34a6062b1d7d44ab8))



