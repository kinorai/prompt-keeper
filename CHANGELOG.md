# [0.5.0](https://github.com/kinorai/prompt-keeper/compare/v0.4.0...v0.5.0) (2025-09-30)


### Bug Fixes

* adjust layout of conversation list item for improved alignment and spacing ([2e99892](https://github.com/kinorai/prompt-keeper/commit/2e9989205ff4eed690ecf671afefc7c0bd776eb1))
* back button on moblie - search on conv view not redirecting to conv list debounced ([c6c0d64](https://github.com/kinorai/prompt-keeper/commit/c6c0d6454cf29c070da6d45c23ef1f50eb93394c))
* **build:** set dynamic rendering for Home component ([1921b47](https://github.com/kinorai/prompt-keeper/commit/1921b47a3c7bcd979935b985834805ca427613bf))
* clandar out of screen AND consolidate default settings into a single defaults file ([f69750d](https://github.com/kinorai/prompt-keeper/commit/f69750df62efc4dcf32413f221de02f7c17956bb))
* click header scroll to conversation top sopt propagation ([c350974](https://github.com/kinorai/prompt-keeper/commit/c350974f005a78db7bbd1bfb2c1108b832e38dcb))
* date conversation item list asymetric ([cbfae10](https://github.com/kinorai/prompt-keeper/commit/cbfae10a4f3798af9b6b4de70fc270bf907df4b3))
* delete confirm popover disapear just after clcik on context menu ([1ca1b75](https://github.com/kinorai/prompt-keeper/commit/1ca1b758e44b628626cbe7985ee1966a2bfefd24))
* keypress search input focus ([f836401](https://github.com/kinorai/prompt-keeper/commit/f836401ea6dc5520fd13df6ae9d8c6aa0bfe7df3))
* null conversation hash ducring build ([4d7c5c5](https://github.com/kinorai/prompt-keeper/commit/4d7c5c5d469a21559fb1b23c199068191f315809))
* popover confirm delete disapear in context menu ([abe4ee2](https://github.com/kinorai/prompt-keeper/commit/abe4ee2279e6852cc8500e5f8df0e852206c2a6b))
* refresh token ([0dffae3](https://github.com/kinorai/prompt-keeper/commit/0dffae371c3499f06ed5a7241e5774d6cc25f9f1))
* system prompt out of screen ([4eda99c](https://github.com/kinorai/prompt-keeper/commit/4eda99c31ab7543248c1fc6701a4d58a431b69c5))
* update conversation card to conditionally render system message content ([a014412](https://github.com/kinorai/prompt-keeper/commit/a0144125208dd73cead7a08a9a2cb2f56aa329e8))


### Features

* add back tooltip delte on mobile BUT it disapears ([daddf91](https://github.com/kinorai/prompt-keeper/commit/daddf915d9af019f817f5d20d327caf9c7f9ad66))
* add expandable system message preview in conversation card ([3468993](https://github.com/kinorai/prompt-keeper/commit/3468993d59b3a9c013e3c44cd9dadd973942e00e))
* add health check endpoints for system readiness and liveness monitoring ([a729db5](https://github.com/kinorai/prompt-keeper/commit/a729db50b6ce6e8a9672bfad6dcf6f1b8f152f81))
* add navigation behavior for mobile by using router.push and implementing native back functionality ([c3f82e8](https://github.com/kinorai/prompt-keeper/commit/c3f82e87318c7e8c47882dd53b0615e19183110f))
* add role filtering to search functionality with toggle group for improved user experience ([d3c39e5](https://github.com/kinorai/prompt-keeper/commit/d3c39e58496c83e3956869be2082d817091d8706))
* add sonner for errors ([2cf34b1](https://github.com/kinorai/prompt-keeper/commit/2cf34b157b65f527ec02911b21662d573ab65d5b))
* enhance conversation list with separators for improved layout and user experience ([5c87f9c](https://github.com/kinorai/prompt-keeper/commit/5c87f9cb498636a72bd03b5ff1ee89f396700a9e))
* ensure OpenSearch index exists before API operations ([1606489](https://github.com/kinorai/prompt-keeper/commit/1606489126b841ec855e8e8e4fcd900f501bb835))
* **gpt-5:** implement WhatsApp-like master/detail view for conversation selection and display ([b6a9d82](https://github.com/kinorai/prompt-keeper/commit/b6a9d827b141cdfcf5c0c0218dc82a0e090125bf))
* implement default search settings and reset filters functionality ([edc87fc](https://github.com/kinorai/prompt-keeper/commit/edc87fcd1125e7ba1d2dd0d354fc984bf4e4f891))
* implement smart search mode with enhanced query parsing and role filtering for improved search accuracy ([ffa3925](https://github.com/kinorai/prompt-keeper/commit/ffa39256d3491fc3b5195d6f2278cc978b681b7f))
* implement undoable delete functionality for conversations with restore capability ([b7a4548](https://github.com/kinorai/prompt-keeper/commit/b7a454813b8e00f1cf6134a85aa6e905f3f96a4d))
* improve list UI responsive ([31bbd27](https://github.com/kinorai/prompt-keeper/commit/31bbd27262c3cb03decfbd75476a9a554ee54a3b))
* integrate framer-motion for button tap animations and update conversation user buble styling ([7fb4d2f](https://github.com/kinorai/prompt-keeper/commit/7fb4d2fc7745dee0e08d0d1ee1edd767b71e06d9))
* range date picker filter ([faa40bb](https://github.com/kinorai/prompt-keeper/commit/faa40bbcda101cdb5571941f6385c281772b9d07))
* reduce default results size from 200 to 40 for improved performance in search functionality ([5abcb4d](https://github.com/kinorai/prompt-keeper/commit/5abcb4df16693fb241f77e6de6a9e7185d54df92))
* remove convertsations in a card on mobile conv view ([d4b06fa](https://github.com/kinorai/prompt-keeper/commit/d4b06fa27684d75beab78f05d9545c0cc972c67a))
* remove search sorting badge logic to consistently order by date ([fbebc5a](https://github.com/kinorai/prompt-keeper/commit/fbebc5adfd5fa4e400bca0379eba85e2cbefe7b4))
* replace back button with a chevron icon for improved navigation in conversation detail view AND remove results found in on conv view ([3fa1bef](https://github.com/kinorai/prompt-keeper/commit/3fa1bef7bf1a3382743bb9884c2e8b775245c388))
* streamdown instead of react markdown for enhanced markdown rendering ([bdafe93](https://github.com/kinorai/prompt-keeper/commit/bdafe937bf67cb886e47caf74b148464073e053c))
* update ChatBubble component to remove assistant bubble background and apply open webui gray user bubble styling ([e2b6fcc](https://github.com/kinorai/prompt-keeper/commit/e2b6fcc747ad4dd6a95266c93f34dc63e57cb679))



# [0.4.0](https://github.com/kinorai/prompt-keeper/compare/v0.3.0...v0.4.0) (2025-07-30)


### Features

* add delete functionality with confirmation dialog ([b43f313](https://github.com/kinorai/prompt-keeper/commit/b43f31307ef8c39cb2a2d367a0c1f9dc542239a3))



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



