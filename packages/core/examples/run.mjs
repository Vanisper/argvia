import { ParseError } from "@argvia/parser";
import { ArgumentError, RouteError } from "../src/index.ts";
import { createWorkspace } from "./workspace.ts";

const app = createWorkspace({
  build: ({ entry, mode, tags }) => JSON.stringify({ operation: "build", entry, mode, tags }),
  inspect: ({ entry }) => JSON.stringify({ operation: "inspect", entry }),
});

try {
  const result = await app.run(process.argv.slice(2));
  process.stdout.write(`${result.kind === "text" ? result.text : result.value}\n`);
} catch (error) {
  if (
    !(error instanceof ParseError || error instanceof ArgumentError || error instanceof RouteError)
  ) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
