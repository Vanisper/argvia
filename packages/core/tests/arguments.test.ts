import { describe, expect, it, vi } from "vite-plus/test";
import { ParseError, values } from "@argvia/parser";

import { ArgumentError, CommandSpecError, createCommand } from "../src/index.ts";

function argumentError(run: () => unknown, code: ArgumentError["code"]) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ArgumentError);
    expect((error as ArgumentError).code).toBe(code);
    return error as ArgumentError;
  }
  throw new Error(`Expected ${code}`);
}

describe("位置参数绑定", () => {
  it("按声明绑定 required、optional 与末尾 variadic，保留原 argv 下标", () => {
    const command = createCommand({
      name: "bind",
      options: [{ long: "verbose", parse: values.boolean(), defaultWhenBare: true }],
      arguments: [
        { name: "count", parse: values.integer(), required: true },
        { name: "name", parse: values.string() },
        { name: "rest", parse: values.string(), variadic: true },
      ],
      handler: (input) => input,
    });
    const result = command.parse(["1", "--verbose", "name", "--", "-tail", ""]);
    expect(result.kind).toBe("command");
    if (result.kind !== "command") throw new Error("Expected command");
    expect(result.input.arguments).toEqual({ count: 1, name: "name", rest: ["-tail", ""] });
    expect(result.input.source.arguments.provided).toEqual({ count: true, name: true, rest: true });
    expect(result.input.source.arguments.records).toEqual({
      count: [{ value: 1, raw: "1", normalized: "1", index: 0 }],
      name: [{ value: "name", raw: "name", normalized: "name", index: 2 }],
      rest: [
        { value: "-tail", raw: "-tail", normalized: "-tail", index: 4 },
        { value: "", raw: "", normalized: "", index: 5 },
      ],
    });
  });

  it("缺席 optional 省略键，variadic 保留独立空数组且未提供", () => {
    const command = createCommand({
      name: "optional",
      arguments: [
        { name: "name", parse: values.string() },
        { name: "rest", parse: values.string(), variadic: true },
      ],
      handler: (input) => input,
    });
    const first = command.parse([]);
    const second = command.parse([]);
    if (first.kind !== "command" || second.kind !== "command") throw new Error("Expected command");
    expect(Object.hasOwn(first.input.arguments, "name")).toBe(false);
    expect(first.input.arguments.rest).toEqual([]);
    expect(first.input.arguments.rest).not.toBe(second.input.arguments.rest);
    expect(first.input.source.arguments.provided).toEqual({ name: false, rest: false });
    expect(first.input.source.arguments.records).toEqual({ name: [], rest: [] });
  });

  it("必填 variadic 至少需要一个值；非必填 variadic 可为空", () => {
    const command = createCommand({
      name: "many",
      arguments: [{ name: "files", parse: values.string(), required: true, variadic: true }],
      handler: (input) => input,
    });
    expect(argumentError(() => command.parse([]), "MissingArgument").argument).toBe("files");
    expect(command.parse(["a", "b"])).toMatchObject({
      kind: "command",
      input: { arguments: { files: ["a", "b"] } },
    });
  });

  it("先检查参数数量，再按声明解码；数量错误不执行值回调", () => {
    const parse = vi.fn(values.integer().parse);
    const command = createCommand({
      name: "quantity",
      arguments: [{ name: "count", parse: { parse }, required: true }],
      handler: () => 0,
    });
    argumentError(() => command.parse([]), "MissingArgument");
    const extra = argumentError(() => command.parse(["invalid", "extra"]), "UnexpectedArgument");
    expect(extra.token).toBe("extra");
    expect(extra.index).toBe(1);
    expect(parse).not.toHaveBeenCalled();
  });

  it("已被选项消费的值不为位置参数预留", () => {
    const command = createCommand({
      name: "consume",
      options: [{ long: "name", parse: values.string() }],
      arguments: [{ name: "jar", parse: values.string(), required: true }],
      handler: () => 0,
    });
    argumentError(() => command.parse(["--name", "app.jar"]), "MissingArgument");
  });

  it("可选位置值被拒绝时不根据值域回退给后面的 variadic", () => {
    const command = createCommand({
      name: "ordered",
      arguments: [
        { name: "count", parse: values.integer() },
        { name: "rest", parse: values.string(), variadic: true },
      ],
      handler: () => 0,
    });
    const error = argumentError(() => command.parse(["word"]), "InvalidArgument");
    expect(error.argument).toBe("count");
    expect(error.raw).toBe("word");
  });

  it("正常化与解析只执行一次，记录正常化前后的文本", async () => {
    const normalize = vi.fn((raw: string) => raw.trim());
    const parse = vi.fn(values.integer().parse);
    const command = createCommand({
      name: "normalize",
      arguments: [{ name: "count", parse: { normalize, parse }, required: true }],
      handler: (input) => input.arguments.count,
    });
    const result = await command.execute([" 2 "]);
    expect(result).toMatchObject({
      kind: "executed",
      value: 2,
      input: {
        source: {
          arguments: { records: { count: [{ value: 2, raw: " 2 ", normalized: "2", index: 0 }] } },
        },
      },
    });
    expect(normalize).toHaveBeenCalledExactlyOnceWith(" 2 ");
    expect(parse).toHaveBeenCalledExactlyOnceWith("2");
  });

  it("合法的 false、0、空串及 undefined 都是已提供的位置值", () => {
    const command = createCommand({
      name: "falsy",
      arguments: [
        { name: "false", parse: values.boolean(), required: true },
        { name: "zero", parse: values.integer(), required: true },
        { name: "empty", parse: values.string(), required: true },
        {
          name: "undefined",
          parse: { parse: () => ({ ok: true as const, value: undefined }) },
          required: true,
        },
      ],
      handler: (input) => input,
    });
    const result = command.parse(["false", "0", "", "anything"]);
    expect(result.kind).toBe("command");
    if (result.kind !== "command") throw new Error("Expected command");
    expect(result.input.arguments).toEqual({
      false: false,
      zero: 0,
      empty: "",
      undefined: undefined,
    });
    expect(Object.hasOwn(result.input.arguments, "undefined")).toBe(true);
    expect(result.input.source.arguments.provided).toEqual({
      false: true,
      zero: true,
      empty: true,
      undefined: true,
    });
  });

  it("位置参数和值记录支持危险键而不触发原型写入", () => {
    const command = createCommand({
      name: "safe",
      arguments: [
        { name: "__proto__", parse: values.string(), required: true },
        { name: "constructor", parse: values.string(), required: true },
      ],
      handler: (input) => input,
    });
    const result = command.parse(["first", "second"]);
    if (result.kind !== "command") throw new Error("Expected command");
    expect(Object.hasOwn(result.input.arguments, "__proto__")).toBe(true);
    expect(result.input.arguments.__proto__).toBe("first");
    expect(result.input.arguments.constructor).toBe("second");
    expect(Object.hasOwn(result.input.source.arguments.records, "__proto__")).toBe(true);
    expect(Object.hasOwn(result.input.source.arguments.provided, "constructor")).toBe(true);
  });

  it("输入选项错误先于位置数量校验，core 保留原 parser 错误类别", () => {
    const command = createCommand({
      name: "priority",
      arguments: [{ name: "file", parse: values.string(), required: true }],
      handler: () => 0,
    });
    expect(() => command.parse(["--unknown"])).toThrow(ParseError);
  });

  it.each(["normalize", "parse"] as const)("位置 %s 的程序异常原样传播", async (stage) => {
    const failure = new Error(`bug in ${stage}`);
    const command = createCommand({
      name: "exception",
      arguments: [
        {
          name: "value",
          parse: {
            normalize(raw: string) {
              if (stage === "normalize") throw failure;
              return raw;
            },
            parse: () => {
              throw failure;
            },
          },
        },
      ],
      handler: () => 0,
    });
    await expect(command.execute(["x"])).rejects.toBe(failure);
  });
});

describe("位置参数规格检查", () => {
  function invalid(arguments_: unknown) {
    expect(() =>
      createCommand({ name: "invalid", arguments: arguments_, handler: () => 0 } as never),
    ).toThrow(CommandSpecError);
  }

  it("拒绝 required 位于 optional 之后", () => {
    invalid([
      { name: "optional", parse: values.string() },
      { name: "required", parse: values.string(), required: true },
    ]);
  });

  it("variadic 只能声明一次并且必须在末尾", () => {
    invalid([
      { name: "rest", parse: values.string(), variadic: true },
      { name: "tail", parse: values.string() },
    ]);
    invalid([
      { name: "first", parse: values.string(), variadic: true },
      { name: "second", parse: values.string(), variadic: true },
    ]);
  });

  it("拒绝空名、重复名、不可调用的解析器与未支持的默认值", () => {
    invalid([{ name: "", parse: values.string() }]);
    invalid([
      { name: "same", parse: values.string() },
      { name: "same", parse: values.string() },
    ]);
    invalid([{ name: "value", parse: { parse: 1 } }]);
    invalid([{ name: "value", parse: values.string(), defaultWhenAbsent: "x" }]);
  });
});
