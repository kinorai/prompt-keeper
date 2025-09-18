import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    ".git/",
    "**/.pnp/**",
    "**/.yarn/**",
    "**/coverage/**",
    "**/.next/**",
    "out/**",
    "build/**",
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
  ]),
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
]);
