import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import unusedImports from "eslint-plugin-unused-imports";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default [
    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            parser: tsParser,
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
            "unused-imports": unusedImports,
        },
        ignores: ["eslint.config.ts", "dist", "node_modules"],
        rules: {
            "@typescript-eslint/naming-convention": [
                "error",

                {
                    selector: "default",
                    format: ["camelCase"],
                },
                {
                    selector: "variable",
                    format: ["camelCase", "UPPER_CASE"],
                },
                {
                    selector: "function",
                    format: ["camelCase"],
                },
                {
                    selector: "parameter",
                    format: ["camelCase"],
                    leadingUnderscore: "allow",
                },
                {
                    selector: "property",
                    format: ["camelCase", "UPPER_CASE"],
                },
                {
                    selector: "objectLiteralProperty",
                    format: null,
                    filter: {
                        regex: "^(Bucket|Key|UploadId|PartNumber|MultipartUpload|Parts|ContentLength|require_protocol)$",
                        match: true,
                    },
                },
                {
                    selector: "typeLike",
                    format: ["PascalCase"],
                },
                {
                    selector: "enumMember",
                    format: ["PascalCase"],
                },
            ],
            "unused-imports/no-unused-imports": "error",
            "unused-imports/no-unused-vars": [
                "warn",
                {
                    vars: "all",
                    varsIgnorePattern: "^_",
                    args: "after-used",
                    argsIgnorePattern: "^_",
                },
            ],
        },
    },
    eslintConfigPrettier,
];
