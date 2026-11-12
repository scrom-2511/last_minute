import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            parser: tsParser,
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
        },
        ignores: ["eslint.config.ts"],
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
                },
                {
                    selector: "property",
                    format: ["camelCase", "UPPER_CASE"],
                },
                {
                    selector: "objectLiteralProperty",
                    format: null,
                    filter: {
                        regex: "^(Bucket|Key)$",
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
        },
    },
];