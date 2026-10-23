import { describe, expect, it, vi } from "vite-plus/test";
import { OptionSpecError, ParseError, values } from "@argvia/parser";

import { ArgumentError, CommandSpecError, createCommand } from "../src/index.ts";

describe("命令解析与执行", () => {
  it("parse 产生已完成调用，execute 保留返回值且每次独立解析", async () => {
    const decode = vi.fn(values.integer().parse);
    const handle = vi.fn((value: number) => value * 2);
    const command = createCommand({
      name: "count",
      options: [{ long: "count", parse: { parse: decode }, required: true }],
      handler(input) {
        return handle(input.options.count);
      },
    });
    const parsed = command.parse(["--count=3"]);
    expect(parsed.kind).toBe("command");
    expect(parsed.name).toBe("count");
    expect(parsed.path).toEqual(["count"]);
    expect(parsed.definition).toBe(command.definition);
    expect(handle).not.toHaveBeenCalled();
    expect(decode).toHaveBeenCalledTimes(1);
    expect(await command.execute(["--count=4"])).toMatchObject({
      kind: "executed",
      name: "count",
      path: ["count"],
      value: 8,
      input: { options: { count: 4 } },
    });
    expect(decode).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenCalledExactlyOnceWith(4);
  });

  it("等待异步 handler，数字和 undefined 都保留为业务值", async () => {
    expect(await createCommand({ name: "zero", handler: async () => 0 }).execute([])).toMatchObject(
      {
        kind: "executed",
        value: 0,
      },
    );
    const result = await createCommand({ name: "empty", handler: () => undefined }).execute([]);
    expect(Object.hasOwn(result, "value")).toBe(true);
    expect(result.value).toBeUndefined();
  });

  it("未声明选项和位置参数时输入为空，元数据不会成为选项", () => {
    const command = createCommand({
      name: "empty",
      metadata: { version: "1.0" },
      handler: (input) => input,
    });
    const parsed = command.parse([]);
    expect(parsed.input.options).toEqual({});
    expect(parsed.input.arguments).toEqual({});
    expect(parsed.input.source.options.values).toEqual({});
    expect(parsed.input.source.options.provided).toEqual({});
    expect(parsed.input.source.arguments.values).toEqual({});
    expect(command.definition.options).toEqual([]);
    expect(() => command.parse(["--help"])).toThrow(ParseError);
    expect(() => command.parse(["--version"])).toThrow(ParseError);
  });

  it("所有选项名使用相同解析规则，值和来源不被移除", () => {
    const command = createCommand({
      name: "inspect",
      options: [
        { long: "help", short: "h", parse: values.string() },
        { long: "version", short: "V", parse: values.string() },
      ],
      arguments: [{ name: "rest", parse: values.string(), variadic: true }],
      handler: (input) => input,
    });
    const { input } = command.parse(["-hmanual", "-Vpreview", "--", "--help"]);
    expect(input.options).toEqual({ help: "manual", version: "preview" });
    expect(input.options).toBe(input.source.options.values);
    expect(input.arguments).toBe(input.source.arguments.values);
    expect(input.source.options.provided).toEqual({ help: true, version: true });
    expect(
      input.source.options.occurrences.map(({ option, index }) => ({ option, index })),
    ).toEqual([
      { option: "help", index: 0 },
      { option: "version", index: 1 },
    ]);
    expect(input.source.options.positionalTokens).toEqual([{ raw: "--help", index: 3 }]);
    expect(input.source.options.terminatorIndex).toBe(2);
    expect(input.arguments.rest).toEqual(["--help"]);
  });

  it("贪婪追加停止后固定绑定位置参数，不重新解析已消费值", async () => {
    const decode = vi.fn(values.integer().parse);
    const command = createCommand({
      name: "collect",
      parser: { greedy: true },
      options: [{ long: "item", parse: { parse: decode }, repeat: "append" }],
      arguments: [{ name: "output", parse: values.string(), required: true }],
      handler(input) {
        return { items: input.options.item, output: input.arguments.output };
      },
    });
    expect(await command.execute(["--item", "1", "2", "out.txt"])).toMatchObject({
      kind: "executed",
      value: { items: [1, 2], output: "out.txt" },
    });
    expect(decode.mock.calls.map(([raw]) => raw)).toEqual(["1", "2", "out.txt"]);
  });

  it("显式绑定和终止符保留字符串原文", () => {
    const command = createCommand({
      name: "send",
      options: [{ long: "label", parse: values.string() }],
      arguments: [{ name: "rest", parse: values.string(), variadic: true }],
      handler: (input) => input,
    });
    expect(command.parse(["--label=--help", "--", "", " a b ", "--version"])).toMatchObject({
      kind: "command",
      input: { options: { label: "--help" }, arguments: { rest: ["", " a b ", "--version"] } },
    });
  });

  it("同步和异步 handler 的异常保持原对象", async () => {
    const failure = new Error("application failure");
    const sync = createCommand({
      name: "sync",
      handler: () => {
        throw failure;
      },
    });
    const asyncCommand = createCommand({
      name: "async",
      handler: async () => {
        throw failure;
      },
    });
    await expect(sync.execute([])).rejects.toBe(failure);
    await expect(asyncCommand.execute([])).rejects.toBe(failure);
  });

  it("创建时固定 handler，外部对象后续修改不改变已创建命令", async () => {
    const original = vi.fn(() => "original");
    const replacement = vi.fn(() => "replacement");
    const definition = { name: "snapshot", handler: original };
    const command = createCommand(definition);
    definition.handler = replacement;
    expect((await command.execute([])).value).toBe("original");
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
  });
});

describe("命令声明与输入检查", () => {
  it.each([null, [], {}, { name: "missing" }, { name: "bad", handler: 1 }])(
    "拒绝没有有效 handler 的命令定义：%j",
    (definition) => {
      expect(() => createCommand(definition as never)).toThrow(CommandSpecError);
    },
  );

  it("叶子不能同时声明子命令", () => {
    expect(() => createCommand({ name: "mixed", commands: [], handler: () => 0 } as never)).toThrow(
      CommandSpecError,
    );
  });

  it("选项规格校验由 parser 统一执行", () => {
    expect(() =>
      createCommand({
        name: "duplicate",
        options: [
          { long: "same", parse: values.string() },
          { long: "same", parse: values.string() },
        ],
        handler: () => 0,
      }),
    ).toThrow(OptionSpecError);
    expect(() =>
      createCommand({
        name: "defaults",
        options: [
          { long: "required", parse: values.string(), required: true, defaultWhenAbsent: "x" },
        ],
        handler: () => 0,
      }),
    ).toThrow(OptionSpecError);
  });

  it("未声明位置参数时，额外输入是位置用法错误", () => {
    const command = createCommand({ name: "empty", handler: () => 0 });
    expect(() => command.parse(["extra"])).toThrow(ArgumentError);
  });
});
