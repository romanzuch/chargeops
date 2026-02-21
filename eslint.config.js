import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import tseslint from "typescript-eslint";

export default [
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,

    {
        languageOptions: {
            parserOptions: {
                project: ["./tsconfig.json"],
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        rules: {
            "prettier/prettier": "error",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
        },
        plugins: {
            prettier: prettierPlugin,
        },
    },
    prettier
]