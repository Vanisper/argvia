import { describe, expect, it, vi } from "vite-plus/test";
import { success, values } from "@argvia/parser";
import { CommandSpecError, createCommand } from "../src/index.ts";

describe("命令定义快照", () => {
  it("描述与执行使用同一份字段规则，外部修改不改变定义", () => {
    const parse = { parse: values.integer().parse };
    const option = { long: "count", short: "c", parse, description: "数量", valueName: "number" };
    const argument = { name: "file", parse: values.string(), required: true };
    const options = [option];
    const arguments_ = [argument];
    const metadata = { version: "1.0", extra: { value: 1 } };
    const definition = {
      name: "build",
      description: "构建项目",
      metadata,
      options,
      arguments: arguments_,
      parser: { greedy: false },
      handler: (input: unknown) => input,
    };
    const command = createCommand(definition);
    option.long = "changed";
    option.description = "新的描述";
    parse.parse = () => success(99);
    argument.name = "changed";
    options.length = 0;
    arguments_.length = 0;
    metadata.version = "2.0";
    definition.parser.greedy = true;
    definition.description = "另一个项目";

    expect(command.definition).toMatchObject({
      kind: "command",
      name: "build",
      description: "构建项目",
      metadata: { version: "1.0" },
      options: [{ long: "count", description: "数量", valueName: "number" }],
      arguments: [{ name: "file", required: true }],
      parser: { greedy: false },
    });
    expect(command.definition.metadata?.extra).toBe(metadata.extra);
    expect(command.parse(["--count=2", "entry.ts"]).input).toMatchObject({
      options: { count: 2 },
      arguments: { file: "entry.ts" },
    });
    expect(Object.isFrozen(command.definition)).toBe(true);
    expect(Object.isFrozen(command.definition.options)).toBe(true);
    expect(Object.isFrozen(command.definition.options[0])).toBe(true);
    expect(Object.isFrozen(command.definition.options[0]!.parse)).toBe(true);
    expect(Object.isFrozen(command.definition.arguments)).toBe(true);
    expect(Object.isFrozen(command.definition.arguments[0])).toBe(true);
    expect(Object.isFrozen(command.definition.parser)).toBe(true);
    expect(Object.isFrozen(command.definition.metadata)).toBe(true);
    expect(Object.isFrozen(metadata.extra)).toBe(false);
  });

  it("读取结构化定义不会执行值回调，默认对象不被深复制", () => {
    const parse = vi.fn((raw: string) => success({ value: raw }));
    const defaultValue = { value: "default" };
    const command = createCommand({
      name: "inspect",
      options: [{ long: "value", parse: { parse }, defaultWhenAbsent: defaultValue }],
      arguments: [{ name: "input", parse: { parse } }],
      handler: () => 0,
    });
    expect(command.definition.options[0].defaultWhenAbsent).toBe(defaultValue);
    expect(command.definition.arguments[0].name).toBe("input");
    expect(parse).not.toHaveBeenCalled();
    expect(command.parse([]).input.options.value).toBe(defaultValue);
    expect(parse).not.toHaveBeenCalled();
  });

  it("裸用和缺席默认值中的显式 undefined 保留属性存在性", () => {
    const command = createCommand({
      name: "undefined",
      options: [
        {
          long: "value",
          parse: { parse: () => success(undefined) },
          defaultWhenBare: undefined,
          defaultWhenAbsent: undefined,
        },
      ],
      handler: (input) => input,
    });
    const option = command.definition.options[0];
    expect(Object.hasOwn(option, "defaultWhenBare")).toBe(true);
    expect(Object.hasOwn(option, "defaultWhenAbsent")).toBe(true);
    const missing = command.parse([]).input;
    const bare = command.parse(["--value"]).input;
    expect(Object.hasOwn(missing.options, "value")).toBe(true);
    expect(missing.source.options.provided.value).toBe(false);
    expect(bare.source.options.provided.value).toBe(true);
  });

  it("共享字段分别取得快照，定义回调只读取一次", () => {
    const parse = vi.fn(values.string().parse);
    const readParse = vi.fn(() => parse);
    const readNormalize = vi.fn(() => (raw: string) => raw.trim());
    const decoder = Object.defineProperties(
      {},
      {
        parse: { get: readParse },
        normalize: { get: readNormalize },
      },
    ) as { parse: typeof parse; normalize: (raw: string) => string };
    const shared = [{ long: "name", parse: decoder }] as const;
    const first = createCommand({ name: "first", options: shared, handler: () => 1 });
    const second = createCommand({ name: "second", options: shared, handler: () => 2 });
    expect(readParse).toHaveBeenCalledTimes(2);
    expect(readNormalize).toHaveBeenCalledTimes(2);
    expect(first.definition.options).not.toBe(second.definition.options);
    expect(first.definition.options[0]).not.toBe(second.definition.options[0]);
    expect(first.parse(["--name= first "]).input.options.name).toBe("first");
    expect(second.parse(["--name= second "]).input.options.name).toBe("second");
    expect(readParse).toHaveBeenCalledTimes(2);
    expect(readNormalize).toHaveBeenCalledTimes(2);
  });

  it("元数据复制自有字段，特殊键保持普通数据", () => {
    const metadata = Object.assign(Object.create({ inherited: "ignored" }), {
      version: "1.0",
    });
    Object.defineProperty(metadata, "__proto__", { value: "safe", enumerable: true });
    const command = createCommand({ name: "meta", metadata, handler: () => 0 });
    expect(Object.getPrototypeOf(command.definition.metadata)).toBe(null);
    expect(Object.hasOwn(command.definition.metadata!, "inherited")).toBe(false);
    expect(Object.hasOwn(command.definition.metadata!, "__proto__")).toBe(true);
    expect(command.definition.metadata?.__proto__).toBe("safe");
  });

  it("继承的默认值与不成立的选项组合仍作为规格错误拒绝", () => {
    const inherited = Object.assign(Object.create({ defaultWhenAbsent: "inherited" }), {
      long: "name",
      parse: values.string(),
    });
    expect(() =>
      createCommand({ name: "invalid", options: [inherited], handler: () => 0 }),
    ).toThrow(CommandSpecError);
    expect(() =>
      createCommand({
        name: "invalid",
        options: [{ long: "name", parse: values.string(), required: true, defaultWhenAbsent: "x" }],
        handler: () => 0,
      }),
    ).toThrow(CommandSpecError);
  });
});

describe("定义名称与元数据约束", () => {
  it.each(["", " file", "file name", "file\nextra", "file\u0000x", "file<name>", "file[name]"])(
    "拒绝名称中的不可展示结构：%j",
    (name) => {
      expect(() => createCommand({ name, handler: () => 0 })).toThrow(CommandSpecError);
      expect(() =>
        createCommand({
          name: "valid",
          options: [{ long: name, parse: values.string() }],
          handler: () => 0,
        }),
      ).toThrow(CommandSpecError);
      expect(() =>
        createCommand({
          name: "valid",
          arguments: [{ name, parse: values.string() }],
          handler: () => 0,
        }),
      ).toThrow(CommandSpecError);
    },
  );

  it("名称允许 Unicode 与普通特殊键，描述可以使用多行文本", () => {
    const command = createCommand({
      name: "构建",
      description: "第一行\n第二行",
      options: [{ long: "__proto__", short: "量", parse: values.integer() }],
      arguments: [{ name: "文件-name", parse: values.string() }],
      handler: (input) => input,
    });
    expect(command.parse(["-量2", "entry.ts"]).input).toMatchObject({
      arguments: { "文件-name": "entry.ts" },
    });
    expect(command.definition.description).toBe("第一行\n第二行");
  });

  it("元数据和配置的容器形状经过校验", () => {
    for (const metadata of [null, [], "version"]) {
      expect(() => createCommand({ name: "invalid", metadata, handler: () => 0 } as never)).toThrow(
        CommandSpecError,
      );
    }
    for (const parser of [null, [], { greedy: "true" }]) {
      expect(() => createCommand({ name: "invalid", parser, handler: () => 0 } as never)).toThrow(
        TypeError,
      );
    }
  });
});
