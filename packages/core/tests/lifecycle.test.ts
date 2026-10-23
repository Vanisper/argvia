import { describe, expect, it, vi } from "vite-plus/test";
import { ParseError, values } from "@argvia/parser";

import { ArgumentError, createCommand } from "../src/index.ts";

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected an exception");
}

describe("命令调用阶段", () => {
  it("准备阶段只解释选项，调用方可在完整性校验前自行处理", () => {
    const position = vi.fn(values.integer().parse);
    const handler = vi.fn(() => 1);
    const command = createCommand({
      name: "inspect",
      options: [
        { long: "describe", parse: values.boolean(), defaultWhenBare: true },
        { long: "token", parse: values.string(), required: true },
      ],
      arguments: [{ name: "count", parse: { parse: position }, required: true }],
      handler,
    });
    const prepared = command.prepare(["--describe", "invalid", "extra"]);
    expect(prepared.kind).toBe("command");
    expect(prepared.options).toEqual({ describe: true });
    expect(prepared.source.positionals).toEqual(["invalid", "extra"]);
    expect(prepared.definition).toBe(command.definition);
    expect(position).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(thrown(() => prepared.complete())).toMatchObject({
      code: "MissingRequired",
      option: "token",
    });
    expect(position).not.toHaveBeenCalled();
  });

  it("完整调用复用准备结果，重复完成只解码一次位置值", async () => {
    const option = vi.fn(values.integer().parse);
    const position = vi.fn(values.string().parse);
    const handler = vi.fn((count: number, label: string) => `${label}:${count}`);
    const command = createCommand({
      name: "record",
      options: [{ long: "count", parse: { parse: option }, required: true }],
      arguments: [{ name: "label", parse: { parse: position }, required: true }],
      handler: (input) => handler(input.options.count, input.arguments.label),
    });
    const argv = ["--count=2", "first"];
    const prepared = command.prepare(argv);
    argv[1] = "changed";
    const completed = prepared.complete();
    expect(prepared.complete()).toBe(completed);
    expect(completed.input.options).toBe(prepared.options);
    expect(completed.input.arguments.label).toBe("first");
    expect(handler).not.toHaveBeenCalled();
    expect((await completed.execute()).value).toBe("first:2");
    expect((await completed.execute()).value).toBe("first:2");
    expect(option).toHaveBeenCalledTimes(1);
    expect(position).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("parse 后的 execute 不再解析，独立 execute 重新建立调用状态", async () => {
    const parse = vi.fn(values.integer().parse);
    const command = createCommand({
      name: "parse",
      arguments: [{ name: "count", parse: { parse }, required: true }],
      handler: (input) => input.arguments.count,
    });
    const completed = command.parse(["1"]);
    await completed.execute();
    expect(parse).toHaveBeenCalledTimes(1);
    await command.execute(["2"]);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("数量或值域错误的完成结果也被缓存", () => {
    const parse = vi.fn(values.integer().parse);
    const command = createCommand({
      name: "number",
      arguments: [{ name: "count", parse: { parse }, required: true }],
      handler: () => 0,
    });
    const missing = command.prepare([]);
    const missingError = thrown(() => missing.complete());
    expect(missingError).toBeInstanceOf(ArgumentError);
    expect(thrown(() => missing.complete())).toBe(missingError);
    const invalid = command.prepare(["wrong"]);
    const invalidError = thrown(() => invalid.complete());
    expect(invalidError).toMatchObject({ code: "InvalidArgument" });
    expect(thrown(() => invalid.complete())).toBe(invalidError);
    expect(parse).toHaveBeenCalledExactlyOnceWith("wrong");
  });

  it.each([undefined, null, "failure", new Error("callback failure")])(
    "任意抛出值都保留身份并且完成阶段不重试：%s",
    (failure) => {
      const parse = vi.fn(() => {
        throw failure;
      });
      const command = createCommand({
        name: "failure",
        arguments: [{ name: "value", parse: { parse } }],
        handler: () => 0,
      });
      const prepared = command.prepare(["raw"]);
      expect(thrown(() => prepared.complete())).toBe(failure);
      expect(thrown(() => prepared.complete())).toBe(failure);
      expect(parse).toHaveBeenCalledTimes(1);
    },
  );

  it("准备阶段仍报告绑定与值错误，普通控制选项不改变错误优先级", () => {
    const command = createCommand({
      name: "inspect",
      options: [
        { long: "describe", parse: values.boolean(), defaultWhenBare: true },
        { long: "count", parse: values.integer() },
      ],
      handler: () => 0,
    });
    expect(thrown(() => command.prepare(["--describe", "--count=bad"]))).toMatchObject({
      code: "InvalidValue",
    });
    expect(() => command.prepare(["--unknown"])).toThrow(ParseError);
  });

  it("阶段对象、结果容器和路径只读，值对象保持原引用", async () => {
    const value = { key: 1 };
    const command = createCommand({
      name: "objects",
      options: [{ long: "object", parse: { parse: () => ({ ok: true as const, value }) } }],
      handler: (input) => input.options.object,
    });
    const prepared = command.prepare(["--object=x"]);
    const completed = prepared.complete();
    const executed = await completed.execute();
    expect(prepared.options.object).toBe(value);
    expect(executed.value).toBe(value);
    for (const container of [
      prepared,
      prepared.path,
      completed,
      completed.path,
      completed.input,
      completed.input.source,
      executed,
    ]) {
      expect(Object.isFrozen(container)).toBe(true);
    }
    expect(Object.isFrozen(value)).toBe(false);
  });
});
