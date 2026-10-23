import { describe, expect, it, vi } from "vite-plus/test";
import { ParseError } from "@argvia/parser";

import { createWorkspace, type WorkspaceServices } from "../src/app.ts";
import { renderHelp } from "../src/help.ts";
import { ArgumentError, createCommand } from "@argvia/core";

function workspace() {
  const build = vi.fn<WorkspaceServices["build"]>(async (input) => `built:${input.entry}`);
  const inspect = vi.fn<WorkspaceServices["inspect"]>((input) => `inspected:${input.entry}`);
  return { ...createWorkspace({ build, inspect }), build, inspect };
}

describe("应用自行组合命令信息与执行", () => {
  it.each([
    { argv: ["--help"], usage: "Usage: tool <command>", label: "assets" },
    { argv: ["assets", "--help"], usage: "Usage: tool assets <command>", label: "build" },
    {
      argv: ["assets", "build", "--help"],
      usage: "Usage: tool assets build <entry>",
      label: "--mode",
    },
  ])("$argv 从当前节点描述生成文本且不调用业务服务", async ({ argv, usage, label }) => {
    const app = workspace();
    const result = await app.run(argv);
    expect(result.kind).toBe("text");
    if (result.kind !== "text") throw new Error("Expected application text");
    expect(result.text).toContain(usage);
    expect(result.text).toContain(label);
    expect(app.build).not.toHaveBeenCalled();
    expect(app.inspect).not.toHaveBeenCalled();
  });

  it("应用通过普通元数据生成版本响应，未完成叶子必填约束", async () => {
    const app = workspace();
    expect(await app.run(["assets", "build", "--version"])).toEqual({
      kind: "text",
      text: "1.0.0",
    });
    expect(app.tree.definition.metadata?.version).toBe("1.0.0");
    expect(app.build).not.toHaveBeenCalled();
    expect(app.inspect).not.toHaveBeenCalled();
  });

  it("分组无额外输入时由应用展示命令列表，不执行默认子命令", async () => {
    const app = workspace();
    const result = await app.run(["assets"]);
    expect(result).toMatchObject({ kind: "text" });
    if (result.kind !== "text") throw new Error("Expected command listing");
    expect(result.text).toContain("build");
    expect(result.text).toContain("inspect");
    expect(app.build).not.toHaveBeenCalled();
    expect(app.inspect).not.toHaveBeenCalled();
  });

  it("正常调用使用已完成输入并等待服务，仅执行一次", async () => {
    const app = workspace();
    expect(
      await app.run(["assets", "build", "app.ts", "--mode=safe", "--tag=one", "--tag=two"]),
    ).toEqual({ kind: "result", value: "built:app.ts" });
    expect(app.build).toHaveBeenCalledExactlyOnceWith({
      entry: "app.ts",
      mode: "safe",
      tags: ["one", "two"],
    });
    expect(app.inspect).not.toHaveBeenCalled();
  });

  it("未指定的模式和追加列表来自字段定义", async () => {
    const app = workspace();
    await app.run(["assets", "build", "app.ts"]);
    expect(app.build).toHaveBeenCalledExactlyOnceWith({ entry: "app.ts", mode: "fast", tags: [] });
  });

  it("控制选项字样作为值或终止符后参数时保留业务含义", async () => {
    const app = workspace();
    expect(await app.run(["assets", "build", "app.ts", "--tag=--help"])).toEqual({
      kind: "result",
      value: "built:app.ts",
    });
    expect(app.build).toHaveBeenCalledExactlyOnceWith({
      entry: "app.ts",
      mode: "fast",
      tags: ["--help"],
    });
    expect(await app.run(["assets", "inspect", "--", "--help"])).toEqual({
      kind: "result",
      value: "inspected:--help",
    });
    expect(app.inspect).toHaveBeenCalledExactlyOnceWith({ entry: "--help" });
  });

  it("显式 false 不触发应用操作，完整校验仍要求位置参数", async () => {
    const app = workspace();
    await expect(app.run(["assets", "build", "--help=false"])).rejects.toBeInstanceOf(
      ArgumentError,
    );
    expect(app.build).not.toHaveBeenCalled();
  });

  it("普通控制选项不覆盖准备阶段的非法值和未知选项错误", async () => {
    const app = workspace();
    await expect(app.run(["assets", "build", "--mode=wrong", "--help"])).rejects.toMatchObject({
      code: "InvalidValue",
    });
    await expect(app.run(["assets", "build", "--unknown", "--help"])).rejects.toBeInstanceOf(
      ParseError,
    );
    expect(app.build).not.toHaveBeenCalled();
  });

  it("读取描述不调用解析器或业务服务，包含节点与字段规则", () => {
    const app = workspace();
    const root = app.tree.definition;
    expect(root.kind).toBe("group");
    const assets = root.commands[0]!;
    if (assets.kind !== "group") throw new Error("Expected assets group");
    const build = assets.commands.find((command) => command.name === "build")!;
    if (build.kind !== "command") throw new Error("Expected build command");
    expect(build.arguments).toMatchObject([{ name: "entry", required: true }]);
    expect(build.options.find((option) => option.long === "mode")).toMatchObject({
      defaultWhenAbsent: "fast",
    });
    expect(build.options.find((option) => option.long === "tag")).toMatchObject({
      repeat: "append",
    });
    expect(renderHelp(build, ["tool", "assets", "build"])).toContain("--tag <tag>");
    expect(app.build).not.toHaveBeenCalled();
    expect(app.inspect).not.toHaveBeenCalled();
    const decode = vi.fn(() => ({ ok: true as const, value: 1 }));
    const handler = vi.fn(() => 1);
    const custom = createCommand({
      name: "custom",
      options: [{ long: "value", parse: { parse: decode } }],
      handler,
    });
    expect(renderHelp(custom.definition, ["custom"])).toContain("--value <value>");
    expect(decode).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});
