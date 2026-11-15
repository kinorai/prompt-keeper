import nextPlugin from "eslint-config-next";

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
      "src/generated/**",
    ],
  },
  // Next.js recommended config
  ...nextPlugin,
  // TypeScript rules. eslint-config-next's next/typescript block already
  // registers the @typescript-eslint plugin and parser for these files;
  // registering our own copy again fails with "Cannot redefine plugin".
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
];

export default config;
