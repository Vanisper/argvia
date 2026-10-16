import { describe, expect, it, vi } from "vite-plus/test";
import { ParseError, values } from "@argvia/parser";

import { ArgumentError, CommandSpecError, createCommand } from "../src/index.ts";

describe("单命令解析与执行", () => {
  it("parse 不执行 handler，execute 保留返回值且只解析一次", async () => {
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
    expect(parsed.kind).toBe("input");
    expect(handle).not.toHaveBeenCalled();
    expect(decode).toHaveBeenCalledTimes(1);
    const executed = await command.execute(["--count=4"]);
    expect(executed).toMatchObject({
      kind: "executed",
      value: 8,
      input: { options: { count: 4 } },
    });
    expect(decode).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenCalledExactlyOnceWith(4);
  });

  it("异步 handler 的返回值被等待，0 仍是普通返回值", async () => {
    const command = createCommand({ name: "zero", handler: async () => 0 });
    expect(await command.execute([])).toMatchObject({ kind: "executed", value: 0 });
  });

  it("没有用户选项和位置参数时输入形状为空", () => {
    const command = createCommand({ name: "empty", handler: (input) => input });
    const parsed = command.parse([]);
    expect(parsed.kind).toBe("input");
    if (parsed.kind !== "input") throw new Error("Expected input");
    expect(parsed.input.options).toEqual({});
    expect(parsed.input.arguments).toEqual({});
    expect(parsed.input.source.options.values).toEqual({});
    expect(parsed.input.source.options.provided).toEqual({});
    expect(parsed.input.source.arguments.values).toEqual({});
  });

  it("贪婪选项消费停止后，core 绑定剩余位置而不重新解析选项", async () => {
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

  it("同步与异步 handler 异常保持同一对象", async () => {
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
});

describe("帮助与版本是普通解析选项上的控制请求", () => {
  it("help 优先 version，二者都跳过必填与位置解析并且不调用 handler", async () => {
    const decode = vi.fn(values.integer().parse);
    const handler = vi.fn(() => "executed");
    const command = createCommand({
      name: "run",
      version: "1.2.3",
      options: [{ long: "required", parse: values.string(), required: true }],
      arguments: [{ name: "count", parse: { parse: decode }, required: true }],
      handler,
    });
    const help = command.parse(["invalid", "extra", "--version", "--help"]);
    expect(help).toEqual({ kind: "help", document: command.help });
    expect(command.parse(["--help", "--version"])).toEqual(help);
    expect(await command.execute(["--help"])).toEqual(help);
    expect(await command.execute(["-V"])).toEqual({ kind: "version", version: "1.2.3" });
    expect(decode).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("显式 false 不请求帮助，普通重复策略以最终值决定请求", () => {
    const command = createCommand({ name: "run", version: "1", handler: () => 0 });
    expect(command.parse(["--help=false"]).kind).toBe("input");
    expect(command.parse(["--help", "--help=false"]).kind).toBe("input");
    expect(command.parse(["--help=false", "--help"]).kind).toBe("help");
    expect(command.parse(["--help=false", "--version"])).toEqual({ kind: "version", version: "1" });
    expect(command.parse(["--version=false"]).kind).toBe("input");
  });

  it.each([
    { argv: ["--help", "--unknown"], code: "UnknownOption" },
    { argv: ["--unknown", "--help"], code: "UnknownOption" },
    { argv: ["--help", "--count=bad"], code: "InvalidValue" },
    { argv: ["--count=bad", "--help"], code: "InvalidValue" },
    { argv: ["--count", "--help"], code: "MissingValue" },
    { argv: ["--help=bad"], code: "InvalidValue" },
    { argv: ["--unique=a", "--help", "--unique=b"], code: "DuplicateOption" },
  ] as const)("help 不跳过 $code：$argv", ({ argv, code }) => {
    const command = createCommand({
      name: "run",
      options: [
        { long: "count", parse: values.integer() },
        { long: "unique", parse: values.string(), repeat: "error" },
      ],
      handler: () => 0,
    });
    try {
      command.parse(argv);
      throw new Error("Expected parser error");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).code).toBe(code);
    }
  });

  it("元数据从业务选项及其来源剔除，保留原始 argv 坐标", () => {
    const command = createCommand({
      name: "run",
      version: "1",
      options: [{ long: "verbose", short: "v", parse: values.boolean(), defaultWhenBare: true }],
      arguments: [{ name: "args", parse: values.string(), variadic: true }],
      handler: (input) => input,
    });
    const parsed = command.parse(["--help=false", "-v", "--version=false", "--", "--help"]);
    expect(parsed.kind).toBe("input");
    if (parsed.kind !== "input") throw new Error("Expected input");
    const { input } = parsed;
    expect(input.options).toEqual({ verbose: true });
    expect(input.options).toBe(input.source.options.values);
    expect(input.arguments).toEqual({ args: ["--help"] });
    expect(Object.keys(input.source.options.provided)).toEqual(["verbose"]);
    expect(Object.keys(input.source.options.records)).toEqual(["verbose"]);
    expect(
      input.source.options.occurrences.map(({ option, index }) => ({ option, index })),
    ).toEqual([{ option: "verbose", index: 1 }]);
    expect(input.source.options.positionalTokens).toEqual([{ raw: "--help", index: 4 }]);
    expect(input.source.options.terminatorIndex).toBe(3);
    expect(input.source.arguments.records.args).toEqual([
      { value: "--help", raw: "--help", normalized: "--help", index: 4 },
    ]);
  });

  it("显式值中的 --help 和终止符后的 --help 均按实际归属处理", () => {
    const command = createCommand({
      name: "run",
      options: [{ long: "name", parse: values.string() }],
      arguments: [{ name: "args", parse: values.string(), variadic: true }],
      handler: (input) => input,
    });
    const explicit = command.parse(["--name=--help"]);
    expect(explicit).toMatchObject({ kind: "input", input: { options: { name: "--help" } } });
    expect(command.parse(["--", "--help"])).toMatchObject({
      kind: "input",
      input: { arguments: { args: ["--help"] } },
    });
  });

  it("关闭自动帮助后可以定义业务 help，未配置版本时也可定义业务 version", () => {
    const command = createCommand({
      name: "custom",
      help: false,
      options: [
        { long: "help", short: "h", parse: values.string() },
        { long: "version", short: "V", parse: values.string() },
      ],
      handler: (input) => input,
    });
    expect(command.parse(["-hmanual", "-Vpreview"])).toMatchObject({
      kind: "input",
      input: { options: { help: "manual", version: "preview" } },
    });
  });

  it("帮助数据冻结并保留声明元数据，不运行值回调", () => {
    const parse = vi.fn(values.integer().parse);
    const command = createCommand({
      name: "jar",
      description: "运行 JAR",
      options: [
        {
          long: "port",
          short: "p",
          parse: { parse },
          valueName: "PORT",
          description: "服务端口",
          required: true,
        },
      ],
      arguments: [
        { name: "jar", parse: values.string(), required: true, description: "JAR 路径" },
        { name: "args", parse: values.string(), variadic: true },
      ],
      handler: () => undefined,
    });
    expect(command.help).toMatchObject({
      name: "jar",
      description: "运行 JAR",
      options: [
        {
          long: "port",
          short: "p",
          valueName: "PORT",
          description: "服务端口",
          required: true,
          repeat: "last",
          bare: false,
        },
        { long: "help", short: "h", bare: true },
      ],
      arguments: [
        { name: "jar", required: true, variadic: false, description: "JAR 路径" },
        { name: "args", required: false, variadic: true },
      ],
    });
    expect(command.help.usage).toContain("jar");
    expect(Object.isFrozen(command.help)).toBe(true);
    expect(Object.isFrozen(command.help.options)).toBe(true);
    expect(command.help.options.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(command.help.arguments)).toBe(true);
    expect(command.help.arguments.every(Object.isFrozen)).toBe(true);
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("命令定义检查", () => {
  it.each([
    { option: { long: "help", parse: values.string() } },
    { option: { long: "custom", short: "h", parse: values.string() } },
    { option: { long: "version", parse: values.string() }, version: "1" },
    { option: { long: "custom", short: "V", parse: values.string() }, version: "1" },
  ])("拒绝和启用的内建选项冲突", ({ option, version }) => {
    expect(() =>
      createCommand({ name: "run", version, options: [option], handler: () => 0 }),
    ).toThrow(CommandSpecError);
  });

  it("无位置参数声明时，额外位置参数是 core 的输入错误", () => {
    const command = createCommand({ name: "empty", handler: () => 0 });
    expect(() => command.parse(["extra"])).toThrow(ArgumentError);
  });
});

describe("java-run：应用闭包持有执行依赖", () => {
  it("独立 jar 命令组合 JVM 参数、必填 jar 和原样程序参数", async () => {
    const launch = vi.fn(
      async (_request: {
        mode: "jar";
        target: string;
        jvm: readonly string[];
        args: readonly string[];
      }) => ({ launched: true }),
    );
    const jar = createCommand({
      name: "jar",
      options: [{ long: "jvm-arg", parse: values.string(), repeat: "append" }],
      arguments: [
        { name: "jar", parse: values.string(), required: true },
        { name: "args", parse: values.string(), variadic: true },
      ],
      handler(input) {
        return launch({
          mode: "jar",
          target: input.arguments.jar,
          jvm: input.options["jvm-arg"],
          args: input.arguments.args,
        });
      },
    });
    expect(
      await jar.execute(["--jvm-arg=-Xmx1g", "app.jar", "--", "--port", "3000"]),
    ).toMatchObject({ kind: "executed", value: { launched: true } });
    expect(launch).toHaveBeenCalledExactlyOnceWith({
      mode: "jar",
      target: "app.jar",
      jvm: ["-Xmx1g"],
      args: ["--port", "3000"],
    });
    expect(jar.parse(["--help"]).kind).toBe("help");
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("独立 main 命令通过必填选项选择入口，业务依赖无需运行上下文对象", async () => {
    const requests: { main: string; args: readonly string[] }[] = [];
    const main = createCommand({
      name: "main",
      options: [{ long: "main", parse: values.string(), required: true }],
      arguments: [{ name: "args", parse: values.string(), variadic: true }],
      handler(input) {
        const request = { main: input.options.main, args: input.arguments.args };
        requests.push(request);
        return request;
      },
    });
    expect(await main.execute(["--main", "example.Main", "--", "--debug", "hello"])).toMatchObject({
      kind: "executed",
      value: { main: "example.Main", args: ["--debug", "hello"] },
    });
    expect(requests).toEqual([{ main: "example.Main", args: ["--debug", "hello"] }]);
    expect(() => main.parse([])).toThrow(ParseError);
  });
});
