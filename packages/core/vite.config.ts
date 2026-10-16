import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    deps: {
      resolveDepSubpath: true,
    },
    dts: {
      generator: "tsgo",
    },
    exports: true,
  },
  test: {
    // 初期空骨架尚无业务测试。
    passWithNoTests: true,
  },
});
