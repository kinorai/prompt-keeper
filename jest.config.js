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
    "src/app/api/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.stories.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 95,
      lines: 85,
      statements: 85,
    },
  },
  // Ignore TypeScript errors during testing
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        // isolatedModules is now configured in tsconfig.json
      },
    ],
  },
  transformIgnorePatterns: ["/node_modules/(?!better-auth|@better-auth|jose).+"],
};
