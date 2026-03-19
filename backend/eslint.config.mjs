import tseslint from "typescript-eslint";

export default tseslint.config(
  // Global ignores
  { ignores: ["dist/**", "node_modules/**"] },

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Project overrides
  {
    rules: {
      // Allow underscore-prefixed unused params (e.g. _ctx in Hono handlers)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
