"use strict";
const config = require("conventional-changelog-conventionalcommits");

module.exports = config({
  types: [
    { type: "feat", section: "Features" },
    { type: "fix", section: "Bug Fixes" },
    { type: "chore", section: "Chores" },
    { type: "docs", hidden: true },
    { type: "style", section: "Style" },
    { type: "refactor", section: "Refactoring" },
    { type: "perf", section: "Performance" },
    { type: "test", hidden: true },
    { type: "build", section: "Build System or External Dependencies" },
    { type: "ci", hidden: true },
    { type: "revert", section: "Reverts" },
  ],
});
