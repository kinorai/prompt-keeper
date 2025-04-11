# Contributing to Prompt Keeper

Thank you for your interest in contributing to Prompt Keeper! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue list as you might find that the bug has already been reported. When you are creating a bug report, please include as many details as possible:

- Use a clear and descriptive title
- Describe the exact steps to reproduce the problem
- Provide specific examples to demonstrate the steps
- Describe the behavior you observed after following the steps
- Explain which behavior you expected to see instead and why
- Include screenshots if possible
- Include details about your configuration and environment

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- A clear and descriptive title
- A detailed description of the proposed functionality
- Any possible implementation details or ideas
- Why this enhancement would be useful to most users

### Pull Requests

- Fill in the required template
- Follow the TypeScript and React style guides
- Include tests when adding new features
- Update documentation as needed
- End all files with a newline
- Place imports in the following order:
  1. Built-in Node modules
  2. External modules (from npm)
  3. Internal modules
  4. Parent directory modules
  5. Same directory modules
- Avoid platform-dependent code
- Ensure all pre-commit checks pass before submitting

## Development Workflow

1. [Fork the repository](https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-a-project)
2. Clone your fork: `git clone https://github.com/your-username/prompt-keeper.git`
3. Create a new branch: `git checkout -b my-feature-branch`
4. Make your changes
5. Run tests: `npm test`
6. Commit your changes: `git commit -m "Description of changes"`
7. Push to the branch: `git push origin my-feature-branch`
8. Submit a pull request

## Development Setup

### Prerequisites

- Node.js (v20 or later)
- npm (v10 or later)
- Docker and Docker Compose (for running OpenSearch locally)
- pre-commit (for Git hook management)

### Installation

1. Clone the repository
2. Install dependencies: `npm ci`
3. Copy `.env.example` to `.env` and configure as needed
4. Start the development server: `npm run dev`
5. Start OpenSearch, litellm and open-webui using Docker Compose: `docker-compose up -f docker-compose.local.yml -d`
6. Install pre-commit hooks: `pre-commit install`

## Testing

- Run all tests: `npm test`
- Run tests in watch mode: `npm run test:watch`
- Generate test coverage: `npm run test:coverage`

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification for our commit messages:

- Structured format: `<type>[optional scope]: <description>`
- Makes commit history readable and automatically generates changelogs
- Communicates nature of changes to teammates and the public
- Triggers build and publish processes
- Makes it easier for people to contribute to the project

### Types
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `build`: Changes that affect the build system or external dependencies
- `ci`: Changes to our CI configuration files and scripts
- `chore`: Other changes that don't modify src or test files
- `revert`: Reverts a previous commit

#### Examples
- `feat: add search functionality to navbar`
- `fix: prevent search crash for empty query strings`
- `docs(contributing): update contribution guidelines`
- `refactor(auth): simplify authentication flow`

Additional guidelines:
- Use the present tense ("add feature" not "added feature")
- Use the imperative mood ("move cursor to..." not "moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests in the footer, e.g., `Fixes #123`
- Use `BREAKING CHANGE:` in the footer to indicate breaking API changes

### TypeScript Style Guide

- Follow the ESLint configuration included in the project
- Use functional components with TypeScript interfaces
- Prefer interfaces over types
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError)

### React Style Guide

- Use functional components and hooks
- Structure files with exported component first, followed by subcomponents, helpers, and types
- Use Tailwind CSS for styling
- Follow the component structure used in the project

## Additional Notes

### Issue and Pull Request Labels

This section lists the labels we use to help us track and manage issues and pull requests.

- `bug`: Issues with confirmed bugs or pull requests that fix bugs
- `enhancement`: Issues suggesting new features or pull requests implementing new features
- `documentation`: Issues or pull requests related to documentation
- `good first issue`: Issues suitable for first-time contributors
- `help wanted`: Issues where we need assistance from the community
- `question`: Issues that are questions or need more information
- `wontfix`: Issues that we've decided not to fix for now

## Thank You!

Your contributions to open source, large or small, make projects like this possible. Thank you for taking the time to contribute.
