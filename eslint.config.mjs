import globals from "globals";
import pluginJs from "@eslint/js";

export default [
    {
        files: ["src/**/*.js"],
        languageOptions: {
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                Lidar: "writable",
                importScripts: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "error",
            "no-undef": "error",
            "no-console": "off"
        }
    },
    pluginJs.configs.recommended,
];
