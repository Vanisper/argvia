import { defaultServerConditions, defineConfig } from "vite-plus";

// 与 Vitest 的 Node 解析条件保持一致，工作区额外选择源码入口。
const sourceConditions = [
  "argvia-source",
  ...defaultServerConditions.filter((condition) => condition !== "module"),
];

export default defineConfig({
  resolve: {
    conditions: sourceConditions,
  },
  ssr: {
    resolve: {
      conditions: sourceConditions,
    },
  },
  pack: {
    deps: {
      resolveDepSubpath: true,
    },
    dts: {
      generator: "tsgo",
    },
    exports: {
      devExports: "argvia-source",
    },
  },
});
