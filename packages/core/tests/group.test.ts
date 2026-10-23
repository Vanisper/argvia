import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { ParseError, values } from "@argvia/parser";
import {
  ArgumentError,
  CommandSpecError,
  createCommand,
  createGroup,
  RouteError,
  type CommandNode,
} from "../src/index.ts";

function errorFrom(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected an error");
}

describe("显式命令路由", () => {
  it("逐层选择命令并保留调用路径，只有 execute 调用处理函数", async () => {
    const handler = vi.fn((input: { arguments: { file: string } }) => input.arguments.file);
    const build = createCommand({
      name: "build",
      arguments: [{ name: "file", parse: values.string(), required: true }],
      handler,
    });
    const app = createGroup({
      name: "tool",
      commands: [createGroup({ name: "assets", commands: [build] })],
    });
    const prepared = app.prepare(["assets", "build", "main.ts"]);
    expect(prepared.kind).toBe("command");
    expect(prepared.path).toEqual(["tool", "assets", "build"]);
    expect(prepared.definition).toBe(build.definition);
    const parsed = prepared.complete();
    expect(parsed.kind).toBe("command");
    expect(parsed.input.arguments).toEqual({ file: "main.ts" });
    expect(handler).not.toHaveBeenCalled();
    expect(await app.execute(["assets", "build", "main.ts"])).toMatchObject({
      kind: "executed",
      path: ["tool", "assets", "build"],
      value: "main.ts",
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("空输入保留分组，不选默认命令；执行分组报告缺少命令", async () => {
    const handler = vi.fn(() => 1);
    const app = createGroup({ name: "tool", commands: [createCommand({ name: "run", handler })] });
    expect(app.prepare([])).toMatchObject({ kind: "group", path: ["tool"] });
    expect(app.parse([])).toMatchObject({ kind: "group", input: { options: {}, arguments: {} } });
    await expect(app.execute([])).rejects.toMatchObject({
      code: "MissingCommand",
      path: ["tool"],
      commands: ["run"],
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("未知名称带有父路径、候选与原 argv 下标，名称大小写敏感", () => {
    const app = createGroup({
      name: "tool",
      commands: [
        createGroup({
          name: "assets",
          commands: [createCommand({ name: "build", handler: () => 0 })],
        }),
      ],
    });
    const error = errorFrom(() => app.prepare(["assets", "Build"]));
    expect(error).toBeInstanceOf(RouteError);
    expect(error).toMatchObject({
      code: "UnknownCommand",
      path: ["tool", "assets"],
      token: "Build",
      index: 1,
      commands: ["build"],
    });
    expect(Object.isFrozen((error as RouteError).details)).toBe(true);
    expect(Object.isFrozen((error as RouteError).commands)).toBe(true);
  });

  it("叶子后的普通字符串属于该命令的位置输入，不再寻找子命令", () => {
    const run = createCommand({
      name: "run",
      arguments: [{ name: "args", parse: values.string(), variadic: true }],
      handler: () => 0,
    });
    const app = createGroup({ name: "tool", commands: [run] });
    expect(app.parse(["run", "run", "assets"])).toMatchObject({
      kind: "command",
      input: { arguments: { args: ["run", "assets"] } },
    });
  });

  it("分组的本地选项可用于调用方处理，选项出现后不再续接命令路径", () => {
    const app = createGroup({
      name: "tool",
      options: [{ long: "inspect", parse: values.boolean(), defaultWhenBare: true }],
      commands: [createCommand({ name: "run", handler: () => 0 })],
    });
    expect(app.prepare(["--inspect"])).toMatchObject({ kind: "group", options: { inspect: true } });
    const prepared = app.prepare(["--inspect", "run"]);
    expect(prepared.kind).toBe("group");
    expect(errorFrom(() => prepared.complete())).toMatchObject({
      code: "UnexpectedArgument",
      index: 1,
      token: "run",
    });
  });

  it("父层选项不进入子命令，复用声明仍属于独立注册表", () => {
    const shared = [{ long: "verbose", parse: values.boolean(), defaultWhenBare: true }] as const;
    const app = createGroup({
      name: "tool",
      options: [{ long: "config", parse: values.string() }],
      commands: [
        createCommand({
          name: "build",
          options: shared,
          handler: (input) => input.options.verbose,
        }),
        createCommand({
          name: "check",
          options: shared,
          handler: (input) => input.options.verbose,
        }),
      ],
    });
    expect(app.parse(["build", "--verbose"])).toMatchObject({
      input: { options: { verbose: true } },
    });
    expect(app.parse(["check"])).toMatchObject({ input: { options: {} } });
    expect(errorFrom(() => app.prepare(["build", "--config=x"]))).toMatchObject({
      code: "UnknownOption",
      index: 1,
    });
    expect(errorFrom(() => app.parse(["--config=x", "build"]))).toBeInstanceOf(ArgumentError);
  });

  it("终止符阻止路由，叶子后的终止符保留所有原文", () => {
    const run = createCommand({
      name: "run",
      arguments: [{ name: "args", parse: values.string(), variadic: true }],
      handler: () => 0,
    });
    const app = createGroup({ name: "tool", commands: [run] });
    expect(app.prepare(["--"])).toMatchObject({ kind: "group", source: { terminatorIndex: 0 } });
    const group = app.prepare(["--", "run"]);
    expect(group.kind).toBe("group");
    expect(errorFrom(() => group.complete())).toMatchObject({
      code: "UnexpectedArgument",
      index: 1,
    });
    expect(app.parse(["run", "--", "--help", "", " spaced "])).toMatchObject({
      input: { arguments: { args: ["--help", "", " spaced "] } },
    });
  });

  it("同一节点可复用于多棵树，定义快照不会携带或污染调用路径", () => {
    const leaf = createCommand({ name: "run", handler: () => 1 });
    const first = createGroup({ name: "first", commands: [leaf] });
    const second = createGroup({
      name: "second",
      commands: [createGroup({ name: "nested", commands: [leaf] })],
    });
    expect(first.prepare(["run"]).path).toEqual(["first", "run"]);
    expect(second.prepare(["nested", "run"]).path).toEqual(["second", "nested", "run"]);
    expect(leaf.prepare([]).path).toEqual(["run"]);
    expect(Object.hasOwn(leaf.definition, "path")).toBe(false);
    expect(first.definition.commands[0]).toBe(leaf.definition);
  });

  it("不同作用域的同名叶子保留各自定义，名称收窄不会虚构唯一输入类型", async () => {
    const numeric = createCommand({
      name: "run",
      options: [{ long: "count", parse: values.integer(), defaultWhenAbsent: 1 }],
      handler: (input) => input.options.count,
    });
    const textual = createCommand({
      name: "run",
      options: [{ long: "label", parse: values.string(), defaultWhenAbsent: "ready" }],
      handler: (input) => input.options.label,
    });
    const app = createGroup({
      name: "tool",
      commands: [
        createGroup({ name: "numeric", commands: [numeric] }),
        createGroup({ name: "textual", commands: [textual] }),
      ],
    });
    const number = await app.execute(["numeric", "run"]);
    const text = await app.execute(["textual", "run"]);
    expectTypeOf(number.name).toEqualTypeOf<"run">();
    expectTypeOf(number.value).toEqualTypeOf<number | string>();
    expect(number.value).toBe(1);
    expect(text.value).toBe("ready");
    expect(number.definition).toBe(numeric.definition);
    expect(text.definition).toBe(textual.definition);
    const parsed = app.parse(["numeric", "run"]);
    if (parsed.kind === "command") {
      const invalid = () => {
        // @ts-expect-error 两个 run 的输入仍是联合，名称本身不保证存在 count
        void parsed.input.options.count;
      };
      expectTypeOf(invalid).toBeFunction();
    }
  });
});

describe("命令树来源坐标", () => {
  function nested<const C extends CommandNode>(leaf: C) {
    return createGroup({
      name: "tool",
      commands: [createGroup({ name: "scope", commands: [leaf] })],
    });
  }

  it("重定位出现、值、位置与终止符，默认记录保留 null，记录引用保持一致", () => {
    const leaf = createCommand({
      name: "run",
      options: [
        { long: "verbose", short: "v", parse: values.boolean(), defaultWhenBare: true },
        { long: "tag", parse: values.string(), repeat: "append" },
        { long: "count", parse: values.integer(), defaultWhenAbsent: 3 },
      ],
      arguments: [{ name: "args", parse: values.string(), variadic: true }],
      handler: () => 0,
    });
    const app = nested(leaf);
    const result = app.parse([
      "scope",
      "run",
      "-v",
      "--tag",
      "x",
      "--tag=y",
      "tail",
      "--",
      "--help",
    ]);
    if (result.kind !== "command") throw new Error("Expected a selected command");
    const source = result.input.source.options;
    expect(source.occurrences.map((occurrence) => occurrence.index)).toEqual([2, 3, 5]);
    expect(source.records.verbose).toMatchObject([{ index: null, source: "bare-default" }]);
    expect(source.records.count).toMatchObject([{ index: null, source: "absent-default" }]);
    expect(source.records.tag).toMatchObject([
      { index: 4, source: "separated" },
      { index: 5, source: "equals" },
    ]);
    expect(source.occurrences[1]!.values[0]).toBe(source.records.tag![0]);
    expect(source.positionalTokens).toEqual([
      { raw: "tail", index: 6 },
      { raw: "--help", index: 8 },
    ]);
    expect(source.terminatorIndex).toBe(7);
    expect(result.input.source.arguments.records.args).toMatchObject([{ index: 6 }, { index: 8 }]);
    expect(Object.isFrozen(source.records.tag)).toBe(true);
    expect(Object.getPrototypeOf(source.records)).toBe(null);
  });

  it("缺值的当前与后续下标以及短簇成员位置使用同一坐标规则", () => {
    const app = nested(
      createCommand({
        name: "run",
        options: [
          { long: "name", parse: values.string() },
          {
            long: "flag",
            short: "f",
            parse: values.boolean(),
            defaultWhenBare: true,
            repeat: "error",
          },
        ],
        handler: () => 0,
      }),
    );
    const missing = errorFrom(() => app.prepare(["scope", "run", "--name", "--flag"]));
    expect(missing).toBeInstanceOf(ParseError);
    expect(missing).toMatchObject({
      code: "MissingValue",
      index: 2,
      nextIndex: 3,
      details: { index: 2, nextIndex: 3 },
    });
    const duplicate = errorFrom(() => app.prepare(["scope", "run", "-ff"]));
    expect(duplicate).toMatchObject({ code: "DuplicateOption", index: 2, clusterPosition: 1 });
  });

  it("位置值错误直接使用根 argv 坐标，程序异常保持身份", () => {
    const app = nested(
      createCommand({
        name: "run",
        arguments: [{ name: "count", parse: values.integer() }],
        handler: () => 0,
      }),
    );
    expect(errorFrom(() => app.parse(["scope", "run", "bad"]))).toMatchObject({
      code: "InvalidArgument",
      index: 2,
    });
    const failure = new Error("decoder failed");
    const failing = nested(
      createCommand({
        name: "run",
        options: [
          {
            long: "value",
            parse: {
              parse() {
                throw failure;
              },
            },
          },
        ],
        handler: () => 0,
      }),
    );
    expect(errorFrom(() => failing.prepare(["scope", "run", "--value=x"]))).toBe(failure);
  });

  it.each([undefined, null, new ParseError("InvalidValue", "application error", { index: 50 })])(
    "值回调抛出的任意值不被来源重定位改写：%s",
    (failure) => {
      const app = nested(
        createCommand({
          name: "run",
          options: [
            {
              long: "value",
              parse: {
                parse() {
                  throw failure;
                },
              },
            },
          ],
          handler: () => 0,
        }),
      );
      expect(errorFrom(() => app.prepare(["scope", "run", "--value=x"]))).toBe(failure);
    },
  );

  it("归一化回调抛出的 ParseError 保持身份与自身坐标，不调用值解析", () => {
    const failure = new ParseError("InvalidValue", "normalization failed", {
      index: 50,
      nextIndex: 51,
    });
    const parse = vi.fn(values.string().parse);
    const app = nested(
      createCommand({
        name: "run",
        options: [
          {
            long: "value",
            parse: {
              normalize() {
                throw failure;
              },
              parse,
            },
          },
        ],
        handler: () => 0,
      }),
    );
    expect(errorFrom(() => app.prepare(["scope", "run", "--value=x"]))).toBe(failure);
    expect(failure.details).toEqual({ index: 50, nextIndex: 51 });
    expect(parse).not.toHaveBeenCalled();
  });

  it.each(["ok", "value", "expected", "reason"] as const)(
    "值协议 %s getter 抛出的 ParseError 保持原始身份与坐标",
    (field) => {
      const failure = new ParseError("InvalidValue", "result accessor failed", {
        index: 50,
        nextIndex: 51,
      });
      const result =
        field === "ok" || field === "value"
          ? { ok: true as const, value: "decoded" }
          : { ok: false as const, expected: "text" };
      Object.defineProperty(result, field, {
        get() {
          throw failure;
        },
        enumerable: true,
      });
      const parse = vi.fn(() => result);
      const app = nested(
        createCommand({
          name: "run",
          options: [{ long: "value", parse: { parse } }],
          handler: () => 0,
        }),
      );
      expect(errorFrom(() => app.prepare(["scope", "run", "--value=x"]))).toBe(failure);
      expect(failure.details).toEqual({ index: 50, nextIndex: 51 });
      expect(parse).toHaveBeenCalledExactlyOnceWith("x");
    },
  );

  it("Unicode 短簇保持码点位置，false 与 undefined 仍为显式贡献", () => {
    const leaf = createCommand({
      name: "run",
      options: [
        { long: "verbose", short: "v", parse: values.boolean(), defaultWhenBare: true },
        { long: "leaf", short: "🌿", parse: values.boolean(), defaultWhenBare: false },
        {
          long: "value",
          short: "x",
          parse: { parse: () => ({ ok: true as const, value: undefined }) },
        },
      ],
      handler: () => 0,
    });
    const parsed = nested(leaf).parse(["scope", "run", "-v🌿xdata"]);
    if (parsed.kind !== "command") throw new Error("Expected a selected command");
    const source = parsed.input.source.options;
    expect(
      source.occurrences.map((occurrence) => [occurrence.index, occurrence.clusterPosition]),
    ).toEqual([
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    expect(source.values).toEqual({ verbose: true, leaf: false, value: undefined });
    expect(source.provided).toEqual({ verbose: true, leaf: true, value: true });
    expect(Object.hasOwn(source.values, "value")).toBe(true);
    expect(source.records.value).toMatchObject([
      { value: undefined, source: "attached", raw: "data", index: 2 },
    ]);
  });
});

describe("分组声明与阶段约束", () => {
  it("分组声明只接受已创建的节点，拒绝同名子节点与叶子字段", () => {
    const leaf = createCommand({ name: "run", handler: () => 0 });
    expect(() => createGroup({ name: "tool", commands: [leaf, leaf] })).toThrow(CommandSpecError);
    expect(() => createGroup({ name: "tool", commands: [{}] } as never)).toThrow(CommandSpecError);
    expect(() =>
      createGroup({ name: "tool", commands: [leaf], handler: () => 0 } as never),
    ).toThrow(CommandSpecError);
    expect(() => createGroup({ name: "tool", commands: [leaf], arguments: [] } as never)).toThrow(
      CommandSpecError,
    );
  });

  it("分组本地必填只在完成时检查，失败完成不重跑值回调", () => {
    const parse = vi.fn(values.string().parse);
    const group = createGroup({
      name: "tool",
      options: [{ long: "required", parse: { parse }, required: true }],
      commands: [],
    });
    const prepared = group.prepare([]);
    expect(prepared.kind).toBe("group");
    const first = errorFrom(() => prepared.complete());
    expect(first).toMatchObject({ code: "MissingRequired" });
    expect(errorFrom(() => prepared.complete())).toBe(first);
    expect(parse).not.toHaveBeenCalled();
  });

  it("公开入口校验整个 argv，分组列表与元数据在创建时快照", () => {
    const children = [createCommand({ name: "run", handler: () => 0 })];
    const metadata = { category: "tools" };
    const app = createGroup({ name: "tool", commands: children, metadata });
    children.length = 0;
    metadata.category = "changed";
    expect(app.definition.commands.map((node) => node.name)).toEqual(["run"]);
    expect(app.definition.metadata).toEqual({ category: "tools" });
    expect(() => app.prepare("run" as never)).toThrow(TypeError);
    expect(() => app.prepare(["run", 1] as never)).toThrow(TypeError);
    expect(Object.isFrozen(app.definition.commands)).toBe(true);
  });
});
