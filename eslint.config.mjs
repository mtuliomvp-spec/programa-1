import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // O confirm nativo não abre no navegador dentro de app nem
    // no atalho do iPhone: o botão "não faz nada". Use perguntar() de
    // src/lib/confirmar.tsx (ou o componente ConfirmButton).
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use perguntar() de @/lib/confirmar — o confirm nativo não abre no celular." },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
