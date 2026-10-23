import { describe, expectTypeOf, it } from "vite-plus/test";
import { values } from "@argvia/parser";

import {
  createCommand,
  createGroup,
  type ArgumentSpec,
  type ArgumentValueRecord,
  type CommandOption,
} from "../src/index.ts";

describe("命令声明的类型推导", () => {
  it("handler 从业务选项与位置声明取得精确上下文，未声明字段不会进入业务输入", () => {
    const command = createCommand({
      name: "typed",
      options: [
        { long: "count", parse: values.integer(), required: true },
        { long: "mode", parse: values.enumeration(["auto", "never"]), defaultWhenAbsent: "auto" },
        { long: "label", parse: values.string() },
        { long: "item", parse: values.integer(), repeat: "append" },
      ],
      arguments: [
        { name: "jar", parse: values.string(), required: true },
        { name: "limit", parse: values.integer() },
        { name: "args", parse: values.string(), variadic: true },
      ],
      handler(input) {
        expectTypeOf(input.options.count).toEqualTypeOf<number>();
        expectTypeOf(input.options.mode).toEqualTypeOf<"auto" | "never">();
        expectTypeOf(input.options.label).toEqualTypeOf<string | undefined>();
        expectTypeOf(input.options.item).toEqualTypeOf<readonly number[]>();
        expectTypeOf(input.arguments.jar).toEqualTypeOf<string>();
        expectTypeOf(input.arguments.limit).toEqualTypeOf<number | undefined>();
        expectTypeOf(input.arguments.args).toEqualTypeOf<readonly string[]>();
        expectTypeOf(input.source.arguments.provided.jar).toEqualTypeOf<boolean>();
        expectTypeOf(input.source.arguments.records.jar).toEqualTypeOf<
          readonly ArgumentValueRecord<string>[]
        >();
        // @ts-expect-error 未声明的 help 不是业务选项
        void input.options.help;
        // @ts-expect-error 未声明的 help 没有来源字段
        void input.source.options.records.help;
        // @ts-expect-error 未声明的位置参数没有字段
        void input.arguments.unknown;
        return input.arguments.jar.length;
      },
    });
    const result = command.parse(["--count=1", "app.jar"]);
    if (result.kind === "command") expectTypeOf(result.input.options.count).toEqualTypeOf<number>();
  });

  it("省略 options/arguments 推导空形状，parse 不混入处理函数返回值", () => {
    const command = createCommand({
      name: "empty",
      handler(input) {
        expectTypeOf(input.options).toEqualTypeOf<Record<never, never>>();
        expectTypeOf(input.arguments).toEqualTypeOf<Record<never, never>>();
        expectTypeOf(input.source.options.values).toEqualTypeOf<Record<never, never>>();
        expectTypeOf(input.source.arguments.values).toEqualTypeOf<Record<never, never>>();
        return 1;
      },
    });
    const result = command.parse([]);
    if (result.kind === "command") {
      expectTypeOf(result.input.arguments).toEqualTypeOf<Record<never, never>>();
      // @ts-expect-error parse 不执行 handler，也没有 handler 返回值
      void result.value;
    }
  });

  it("execute 保存同步返回类型，并等待异步返回类型", async () => {
    const sync = createCommand({ name: "sync", handler: () => ({ count: 1 }) });
    const syncResult = await sync.execute([]);
    if (syncResult.kind === "executed") {
      expectTypeOf(syncResult.value).toEqualTypeOf<{ count: number }>();
    }
    const asyncCommand = createCommand({
      name: "async",
      handler: async () => ({ state: "ready" as const, count: 2 }),
    });
    const asyncResult = await asyncCommand.execute([]);
    if (asyncResult.kind === "executed") {
      expectTypeOf(asyncResult.value).toEqualTypeOf<{ state: "ready"; count: number }>();
      expectTypeOf(asyncResult.value).not.toBeAny();
    }
  });

  it("动态选项和位置数组对名称与值形态保持保守", () => {
    const options: CommandOption<number>[] = [];
    const arguments_: ArgumentSpec<number>[] = [];
    const command = createCommand({
      name: "dynamic",
      options,
      arguments: arguments_,
      handler(input) {
        expectTypeOf(input.options.count).toEqualTypeOf<
          number | readonly (number | undefined)[] | undefined
        >();
        expectTypeOf(input.arguments.count).toEqualTypeOf<number | readonly number[] | undefined>();
        expectTypeOf(input.source.arguments.provided.count).toEqualTypeOf<boolean | undefined>();
        expectTypeOf(input.source.arguments.records.count).toEqualTypeOf<
          readonly ArgumentValueRecord<number>[] | undefined
        >();
        return input;
      },
    });
    command.parse([]);
  });

  it("运行时 variadic 与 required 不虚构确定的数组或必有键", () => {
    function define(variadic: boolean, required: boolean) {
      return createCommand({
        name: "dynamic-flags",
        arguments: [{ name: "value", parse: values.integer(), variadic, required }],
        handler(input) {
          expectTypeOf(input.arguments.value).toEqualTypeOf<
            number | readonly number[] | undefined
          >();
          return input.arguments.value;
        },
      });
    }
    define(false, false).parse([]);
  });

  it("无限模板名称和混合宽化名称的来源也保留缺席可能", () => {
    function prefixed(name: `x-${string}`) {
      return createCommand({
        name: "pattern",
        arguments: [{ name, parse: values.string(), variadic: true }],
        handler(input) {
          expectTypeOf(input.arguments["x-unknown"]).toEqualTypeOf<readonly string[] | undefined>();
          expectTypeOf(input.source.arguments.provided["x-unknown"]).toEqualTypeOf<
            boolean | undefined
          >();
          expectTypeOf(input.source.arguments.records["x-unknown"]).toEqualTypeOf<
            readonly ArgumentValueRecord<string>[] | undefined
          >();
          return input;
        },
      });
    }
    function mixed(name: string) {
      return createCommand({
        name: "mixed",
        arguments: [
          { name: "count", parse: values.integer(), required: true },
          { name, parse: values.string() },
        ],
        handler(input) {
          expectTypeOf(input.arguments.count).toEqualTypeOf<number | string | undefined>();
          expectTypeOf(input.source.arguments.records.count).toEqualTypeOf<
            readonly ArgumentValueRecord<number | string>[] | undefined
          >();
          return input;
        },
      });
    }
    prefixed("x-known");
    mixed("label");
  });

  it("handler 参数不能反向替换选项或位置参数的推导类型", () => {
    const invalid = () => {
      createCommand({
        name: "option",
        options: [{ long: "count", parse: values.integer(), required: true }],
        // @ts-expect-error handler 必须接收已由规格确定的 number
        handler: (_input: { options: { count: string } }) => 1,
      });
      createCommand({
        name: "argument",
        arguments: [{ name: "count", parse: values.integer(), required: true }],
        // @ts-expect-error handler 不能把位置 number 推成 string
        handler: (_input: { arguments: { count: string } }) => 1,
      });
    };
    expectTypeOf(invalid).toBeFunction();
  });

  it("显式非空泛型不能省略对应声明字段", () => {
    const options = [{ long: "count", parse: values.integer(), required: true }] as const;
    const arguments_ = [{ name: "jar", parse: values.string(), required: true }] as const;
    const invalid = () => {
      // @ts-expect-error 指定非空 S 必须提供 options
      createCommand<typeof options, readonly [], number>({
        name: "missing-options",
        handler: () => 1,
      });
      // @ts-expect-error 指定非空 A 必须提供 arguments
      createCommand<readonly [], typeof arguments_, number>({
        name: "missing-arguments",
        handler: () => 1,
      });
    };
    expectTypeOf(invalid).toBeFunction();
  });
});

describe("阶段与命令树类型", () => {
  it("准备态保留必填选项缺席，完整态提供确定输入", () => {
    const command = createCommand({
      name: "required",
      options: [{ long: "count", parse: values.integer(), required: true }],
      arguments: [{ name: "entry", parse: values.string(), required: true }],
      handler: (input) => input.options.count,
    });
    const prepared = command.prepare(["--count=1", "main.ts"]);
    expectTypeOf(prepared.options.count).toEqualTypeOf<number | undefined>();
    expectTypeOf(prepared.name).toEqualTypeOf<"required">();
    const completed = prepared.complete();
    expectTypeOf(completed.input.options.count).toEqualTypeOf<number>();
    expectTypeOf(completed.input.arguments.entry).toEqualTypeOf<string>();
    const invalid = () => {
      // @ts-expect-error 准备阶段没有已完成输入
      void prepared.input;
      // @ts-expect-error 准备阶段不能直接执行
      void prepared.execute;
    };
    expectTypeOf(invalid).toBeFunction();
  });

  it("共享元组经 spread 复用时保持名称、默认与枚举值域", async () => {
    const shared = [
      { long: "port", parse: values.integer(), defaultWhenAbsent: 8080 },
      { long: "mode", parse: values.enumeration(["dev", "prod"]), defaultWhenAbsent: "dev" },
    ] as const satisfies readonly CommandOption[];
    const inspect = createCommand({
      name: "inspect",
      options: [...shared],
      handler(input) {
        expectTypeOf(input.options.port).toEqualTypeOf<number>();
        expectTypeOf(input.options.mode).toEqualTypeOf<"dev" | "prod">();
        return { port: input.options.port, mode: input.options.mode };
      },
    });
    const build = createCommand({
      name: "build",
      options: [...shared, { long: "force", parse: values.boolean(), defaultWhenBare: true }],
      handler(input) {
        expectTypeOf(input.options.force).toEqualTypeOf<boolean | undefined>();
        expectTypeOf(input.options.port).toEqualTypeOf<number>();
        return input.options.mode;
      },
    });
    expectTypeOf((await inspect.execute([])).value).toEqualTypeOf<{
      port: number;
      mode: "dev" | "prod";
    }>();
    expectTypeOf((await build.execute([])).value).toEqualTypeOf<"dev" | "prod">();
  });

  it("命令工厂保存字面量名称和处理函数结果", async () => {
    function named<const N extends string>(name: N) {
      return createCommand({ name, handler: async () => ({ name, ready: true as const }) });
    }
    const command = named("check");
    expectTypeOf(command.definition.name).toEqualTypeOf<"check">();
    expectTypeOf((await command.execute([])).value).toEqualTypeOf<{
      name: "check";
      ready: true;
    }>();
  });

  it("树的选择结果按名称收窄输入与返回值，组结果不能执行", async () => {
    const count = createCommand({
      name: "count",
      options: [{ long: "count", parse: values.integer(), defaultWhenAbsent: 1 }],
      handler: (input) => input.options.count,
    });
    const label = createCommand({
      name: "label",
      arguments: [{ name: "label", parse: values.string(), required: true }],
      handler: (input) => input.arguments.label,
    });
    const tools = createGroup({ name: "tools", commands: [count, label] });
    const app = createGroup({ name: "app", commands: [tools] });
    const prepared = app.prepare(["tools", "count"]);
    expectTypeOf(prepared.name).toEqualTypeOf<"app" | "tools" | "count" | "label">();
    if (prepared.name === "count") {
      expectTypeOf(prepared.options.count).toEqualTypeOf<number>();
      expectTypeOf(prepared.complete().input.options.count).toEqualTypeOf<number>();
      expectTypeOf((await prepared.complete().execute()).value).toEqualTypeOf<number>();
    }
    const parsed = app.parse(["tools", "label", "hello"]);
    if (parsed.name === "label") {
      expectTypeOf(parsed.input.arguments.label).toEqualTypeOf<string>();
      expectTypeOf((await parsed.execute()).value).toEqualTypeOf<string>();
    }
    const executed = await app.execute(["tools", "count"]);
    expectTypeOf(executed.name).toEqualTypeOf<"count" | "label">();
    expectTypeOf(executed.value).toEqualTypeOf<number | string>();
    if (executed.name === "count") expectTypeOf(executed.value).toEqualTypeOf<number>();
    const invalid = () => {
      const group = app.parse([]);
      if (group.kind === "group") {
        // @ts-expect-error 分组的完整输入不提供处理函数执行
        void group.execute;
      }
    };
    expectTypeOf(invalid).toBeFunction();
  });

  it("叶子与分组声明互斥，分组不承诺继承子命令字段", () => {
    const child = createCommand({ name: "child", handler: () => 1 });
    const invalid = () => {
      createCommand({
        name: "mixed",
        // @ts-expect-error 叶子命令不能有子命令
        commands: [child],
        handler: () => 1,
      });
      createGroup({
        name: "mixed",
        commands: [child],
        // @ts-expect-error 分组不能声明处理函数
        handler: () => 1,
      });
      createGroup({
        name: "position",
        commands: [child],
        // @ts-expect-error 分组不声明位置参数
        arguments: [{ name: "item", parse: values.string() }],
      });
    };
    expectTypeOf(invalid).toBeFunction();
  });

  it("选项默认值接受值域检查，显式 undefined 不被当作未声明", () => {
    const invalid = () => {
      createCommand({
        name: "invalid-default",
        // @ts-expect-error number 值域不能使用 string 默认值
        options: [{ long: "count", parse: values.integer(), defaultWhenAbsent: "one" }],
        handler: () => 0,
      });
      createCommand({
        name: "invalid-bare",
        // @ts-expect-error string 值域不接受 undefined 裸用值
        options: [{ long: "name", parse: values.string(), defaultWhenBare: undefined }],
        handler: () => 0,
      });
      createGroup({
        name: "invalid-group",
        // @ts-expect-error 分组选项也检查默认值值域
        options: [{ long: "count", parse: values.integer(), defaultWhenAbsent: "one" }],
        commands: [],
      });
    };
    expectTypeOf(invalid).toBeFunction();
  });
});
