#!/usr/bin/env sh

type='build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test'
scope='\([A-Za-z0-9_-]+\)'
subject='[a-z].*[^.]'

if grep -E "^($type)($scope)?!?: $subject$" "$1"; then
  exit 0
fi

if [ "$1" = '.git/COMMIT_EDITMSG' ]; then
  cat <<EOF
Commit messages should adhere to the Conventional Commits specification:

<type>[optional scope]: <description>

[optional body]

[optional footer(s)]

Where type must be one of the following:
  - feat: A new feature (correlates with MINOR in semantic versioning)
  - fix: A bug fix (correlates with PATCH in semantic versioning)
  - docs: Documentation only changes
  - style: Changes that don't affect the meaning of the code (white-space,
    formatting, etc)
  - refactor: A code change that neither fixes a bug nor adds a feature
  - perf: A code change that improves performance
  - test: Adding missing tests or correcting existing tests
  - build: Changes that affect the build system or external dependencies
  - chore: Other changes that don't modify src or test files
  - ci: Changes to CI configuration files and scripts
  - revert: Reverts a previous commit

Breaking changes must be indicated by either:
  - A ! immediately before the colon (e.g., feat!: breaking change)
  - A footer starting with "BREAKING CHANGE:" (this will trigger a MAJOR version bump)

For more information, see: https://www.conventionalcommits.org/
EOF
fi

exit 1
