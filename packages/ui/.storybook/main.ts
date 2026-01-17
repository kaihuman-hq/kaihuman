// This file has been automatically migrated to valid ESM format by Storybook.
import { createRequire } from "node:module";
import type { StorybookConfig } from "@storybook/preact-vite";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);

function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, "package.json")));
}

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],

  addons: [
    getAbsolutePath("@storybook/addon-links"),
    getAbsolutePath("@storybook/addon-docs")
  ],

  framework: {
    name: getAbsolutePath("@storybook/preact-vite"),
    options: {},
  },

  async viteFinal(config) {
    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          react: "preact/compat",
          "react-dom/test-utils": "preact/test-utils",
          "react-dom": "preact/compat",
          "react/jsx-runtime": "preact/jsx-runtime",
        },
      },
    };
  }
};
export default config;
