import { describe, expect, it, vi } from "vite-plus/test";
import { success, values } from "@argvia/parser";

import { createCommand, renderHelp } from "../src/index.ts";

describe("帮助文本", () => {
  it("最小命令不生成空参数节，保留多行描述", () => {
    const command = createCommand({
      name: "run",
      help: false,
      description: "第一行\n第二行",
      handler: () => undefined,
    });
    expect(renderHelp(command.help)).toBe("Usage: run\n\n第一行\n第二行");
  });

  it("从声明显示位置数量、长短名、值标签和重复规则", () => {
    const command = createCommand({
      name: "serve",
      options: [
        { long: "port", short: "p", parse: values.integer(), valueName: "PORT", required: true },
        { long: "include", parse: values.string(), repeat: "append", description: "包含目录" },
        { long: "color", parse: values.string(), defaultWhenBare: "always", valueName: "mode" },
      ],
      arguments: [
        { name: "entry", parse: values.string(), required: true },
        { name: "rest", parse: values.string(), variadic: true },
      ],
      handler: () => undefined,
    });
    const text = renderHelp(command.help);
    for (const fragment of [
      "Usage: serve [options] <entry> [rest...]",
      "Arguments:",
      "Options:",
      "-p <PORT>",
      "--port <PORT>",
      "required",
      "--include <include>",
      "包含目录",
      "repeat: append",
      "--color[=<mode>]",
      "--help",
    ]) {
      expect(text).toContain(fragment);
    }
    expect(renderHelp(command.help)).toBe(text);
  });

  it("请求与渲染帮助不解析位置值或序列化默认对象", () => {
    const fallback: { self?: unknown; toJSON(): never } = {
      toJSON() {
        throw new Error("Default values must not be serialized for help");
      },
    };
    fallback.self = fallback;
    const optionParse = vi.fn((_raw: string) => success(fallback));
    const positionalParse = vi.fn(values.integer().parse);
    const handler = vi.fn(() => undefined);
    const command = createCommand({
      name: "run",
      options: [{ long: "config", parse: { parse: optionParse }, defaultWhenAbsent: fallback }],
      arguments: [{ name: "count", parse: { parse: positionalParse }, required: true }],
      handler,
    });
    const request = command.parse(["not-an-integer", "--help"]);
    expect(request.kind).toBe("help");
    if (request.kind !== "help") throw new Error("Expected help");
    expect(renderHelp(request.document)).toContain("--config");
    expect(optionParse).not.toHaveBeenCalled();
    expect(positionalParse).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});
