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

## [0.5.0](https://github.com/kinorai/prompt-keeper/compare/v0.4.0...v0.5.0) (2025-09-30)


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

