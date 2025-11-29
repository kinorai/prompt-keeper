import nextPlugin from "eslint-config-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const config = [
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      ".git/",
      "**/.pnp/**",
      "**/.yarn/**",
      "**/coverage/**",
      "**/.next/**",
      "out/**",
      "build/**",
      "dist/**",
      ".DS_Store",
      "*.pem",
      ".vscode/**",
      "npm-debug.log*",
      "yarn-debug.log*",
      "yarn-error.log*",
      ".pnpm-debug.log*",
      ".env*",
      ".vercel/**",
      "*.tsbuildinfo",
      "next-env.d.ts",
      "backup/**",
      "*.old.bak",
    ],
  },
  // Next.js recommended config
  ...nextPlugin,
  // TypeScript configuration
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
];

export default config;
