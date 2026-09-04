// Плаский конфіг ESLint 10. Обсяг свідомо вузький — рішення й виміри, на яких він
// стоїть, у docs/backlog/done/p2-eslint-adoption.md.
//
// Область та сама, що в `pnpm typecheck`: `src` і `build` (див. tsconfig.json).
import { defineConfig, globalIgnores } from "eslint/config";

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  globalIgnores([
    "dist/",
    "src-tauri/target/",
    // Генерується paraglide під час `vite:build`; лежить у .gitignore.
    "src/i18n/paraglide/",
    // Той самий генератор, але покинутий вихідний каталог: git його не відстежує
    // (`git ls-files src/paraglide` порожній), vite.config.ts пише в src/i18n/paraglide.
    "src/paraglide/",
  ]),

  {
    files: ["src/**/*.{ts,tsx}", "build/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Директива, що більше нічого не глушить, — така сама вада, як забута залежність:
    // коментар виглядає поясненням, і читач йому вірить. `pnpm lint` іде з
    // `--max-warnings 0`, тож це так само валить ворота.
    //
    // Стоїть саме тут, а не окремим блоком: конфіг без `files` застосовується до ВСІХ
    // файлів і цим втягує в перевірку згенерований `.js`.
    linterOptions: { reportUnusedDisableDirectives: "warn" },
    rules: {
      // Вирівняно з tsconfig: `noUnusedLocals`/`noUnusedParameters` уже мовчать на
      // іменах із підкресленням, і ESLint має мовчати там само. Різниця лише в
      // `caughtErrors`: TypeScript не бачить невикористану змінну `catch`, ESLint бачить —
      // саме заради цього правило й лишається увімкненим.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // `build/` — це Node-бік (vite-плагін і перевірки документації), не браузер.
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["build/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  // react-hooks: РІВНО два класичні правила.
  //
  // `reactHooks.configs.flat.recommended` свідомо НЕ береться, хоч README плагіна й
  // радить протилежне («we strongly encourage using the recommended presets»). З
  // версії 7.0.0 цей пресет вмикає шістнадцять правил: до двох класичних додаються
  // чотирнадцять правил React Compiler, і сам компілятор їде всередині пакета.
  // Виміряно на цій кодовій базі: два правила нижче дають 0 помилок, а повний пресет —
  // 27, усі з компіляторного набору. Проєкт у той контракт не заходив: у `src` немає
  // жодного startTransition/useTransition/useDeferredValue/Suspense/lazy, і React
  // Compiler не підключений у vite.config.ts. Якщо це колись зміниться — пресет варто
  // переглянути, і тоді ці 27 місць доведеться розібрати.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
]);
