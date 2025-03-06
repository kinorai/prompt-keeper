/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jest-environment-node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.stories.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  // Ignore TypeScript errors during testing
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        isolatedModules: true, // This will ignore TypeScript errors
      },
    ],
  },
};
