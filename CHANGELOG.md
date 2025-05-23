# [0.1.0](https://github.com/kinorai/prompt-keeper/compare/v0.1.0...v0.1.0) (2025-05-23)


### Features
Here's a generated changelog based on the provided commit messages, categorized by version and type of change:

## v0.5.0

### Features

*   Reverted version bumping logic to only affect pull request close.

### CI/CD

*   Implemented GitHub auto-release for CI/CD.

## v0.4.0

### Features

*   Empty search now returns the latest conversations.

### CI/CD

*   Enabled `versioning-docker-publish` trigger on merged pull requests.
*   Debugged and enabled release on the `main` branch.

## v0.3.0

### Features

*   Added Docker Compose support with `apr1`.
*   Refactored authentication to use MD5.

### Tests

*   Improved tests coverage for authentication, completion, and search functionalities.

## v0.2.0

### Features

*   Increased chat completion timeout to 2 minutes.

## v0.1.3

### CI/CD

*   Fixed `release-auto` trigger on push tags.

## v0.1.1

### CI/CD

*   Fixed `skip on empty` for `release-auto`.
*   Refactored release process using `softprops/action-gh-release@v2`.

## v0.1.0

### Features

*   Increased JWT expiration to 60 days.
*   Removed Helm chart for simpler deployment.
*   Implemented fixed header click to scroll to the top of conversations.
*   Introduced fuzzy ordering by score, and others by date for search results.
*   Reduced default page size to 10 and steps to 1 for pagination.
*   Added a dark mode toggle.
*   Refactored conversations to display like a chat.
*   Implemented and then removed (based on commit history) the highlight searched word feature.
*   Added search for existing conversations, limited to over 1 year.
*   Removed raw responses from various parts of the codebase.
*   Added hash logic to update existing conversations.
*   Adjusted UI for improved mobile and desktop experience.
*   Removed LiteLLM authentication routes.
*   Added authentication and confirmed successful deployment.
*   Enabled deployment with Helm and fixed linting issues.
*   Added copy buttons for conversation content.
*   Reworked timestamp badge display.
*   Improved highlighting and display of user messages instead of just assistant responses.
*   Added Markdown support for chat messages.
*   Established working API and search functionalities.
*   Implemented OpenAI-compatible completions.
*   Integrated all Shadcn components and theme provider.
*   Set up an initial empty Next.js repository.
*   Project renamed to "Prompt Keeper".
*   Initial commit for the project.

### Bug Fixes

*   Fixed labeler configuration structure.
*   Fixed debounce query on input change.
*   Fixed bug with highlighted text in code blocks.

### Refactor

*   Updated `commitlint` to use the new CLI.

### CI/CD

*   Switched to `TriPSs/conventional-changelog-action@v5` for changelog generation.
*   Fixed issues with permissions for `release-auto` (multiple adjustments).
*   Fixed release trigger and Docker versioning.
*   Refactored versioning to consistently use the "v" prefix.
*   Harmonized npm package installation across workflows.
*   Added CodeQL analysis for security.
*   Unified cache strategy across all workflows.
*   Modified PR labels configuration.
*   Refactored Docker build and push with ARM runner.
*   Fixed Docker publish platform ARM execution format error.
*   Integrated Google Release Conventional Commit.
*   Enabled multi-platform ARM/AMD Docker publishing.
*   Added check for CI cache before installing dependencies.
*   Refactored CI with distinct lint, test, and build jobs.
*   Merged code quality and CI actions files.
*   Added pre-commit hooks.
*   Added write permissions for versioning.
*   Integrated versioning and Docker build/push.
*   Added GitHub Actions for CI/CD.
*   Set package version to 0.0.0 initially for CI/CD.

### Documentation

*   Updated installation documentation.
*   Prepared documentation for open-source release.
*   Improved contributing guidelines and README.

### Tests

*   Achieved API unit test coverage greater than 80%.
*   Added initial API unit tests.
*   Added general unit tests.
*   (Note: A commit `test: remove all tests` is present, suggesting a refactor of testing strategy before new tests were added.)

### Chores

*   Numerous internal version bumps (e.g., 0.0.1, 0.0.2, 0.2.0, 0.3.0, 0.4.0, 0.5.0, 0.6.0, 0.7.0, 0.8.0, 0.10.0, 0.11.0) leading up to the `v0.1.0` release.
*   Adjusted Prettier `printWidth` to 120.
*   Upgraded LiteLLM chart.
*   Bumped all packages to their latest versions.
*   Removed unused Shadcn components and other dependencies.
*   Upgraded TailwindCSS.
*   Fixed Prettier errors.
*   Created `dependabot.yml`.
*   Removed old files.
*   Initial project setup commits.
