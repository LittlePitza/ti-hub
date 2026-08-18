import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "next-env.d.ts",
      "types/database.ts", // generated from the Supabase schema
    ],
  },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    rules: {
      // Unused code is worth surfacing, but an unused function argument is often
      // required by a signature (Next.js error boundaries, event handlers), so
      // allow the conventional underscore prefix as an opt-out.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // `any` defeats the generated Supabase types; keep it visible but not blocking.
      "@typescript-eslint/no-explicit-any": "warn",
      // Every <img> in this app is either a brand logo (SVG, or a PNG inside a
      // print-only document) or a photo behind a short-lived Supabase signed URL.
      // next/image optimizes neither: it passes SVG through untouched, its lazy
      // loading and srcset actively hurt printing, and a rotating signed host
      // cannot be expressed as a stable remotePattern.
      "@next/next/no-img-element": "off",
    },
  },

  {
    // Server actions and domain modules run on the server, where console output
    // goes to the platform log and is the intended way to report a failure.
    files: ["**/actions.ts", "lib/**/*.ts", "middleware.ts"],
    rules: { "no-console": "off" },
  },
];

export default config;
