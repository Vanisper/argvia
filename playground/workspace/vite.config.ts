import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      start: {
        command: "node src/main.ts",
        cache: false,
      },
    },
  },
});
