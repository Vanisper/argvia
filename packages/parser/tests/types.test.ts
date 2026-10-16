import { describe, expectTypeOf, it } from "vite-plus/test";

import {
  createParser,
  values,
  type OptionSpec,
  type ParsedArguments,
  type Repeat,
  type ValueParser,
  type ValueRecord,
} from "../src/index.ts";

describe("公共类型契约", () => {
  it("prepare 保留 required 缺席的可能，complete 与 parse 才证明存在", () => {
    const options = [
      { long: "count", parse: values.integer(), required: true },
      { long: "name", parse: values.string() },
      { long: "item", parse: values.integer(), repeat: "append" },
      { long: "format", parse: values.string(), defaultWhenAbsent: "text" },
    ] as const;
    const parser = createParser(options);
    const prepared = parser.prepare(["--count=1"]);
    const completed = parser.complete(prepared);
    const parsed = parser.parse(["--count=1"]);
    expectTypeOf(prepared.values.count).toEqualTypeOf<number | undefined>();
    expectTypeOf(completed.values.count).toEqualTypeOf<number>();
    expectTypeOf(parsed.values.count).toEqualTypeOf<number>();
    expectTypeOf(parsed.values.name).toEqualTypeOf<string | undefined>();
    expectTypeOf(prepared.values.item).toEqualTypeOf<readonly number[]>();
    expectTypeOf(prepared.values.format).toEqualTypeOf<string>();
    expectTypeOf(parsed.provided.count).toEqualTypeOf<boolean>();
    expectTypeOf(parsed.records.count).toEqualTypeOf<readonly ValueRecord<number>[]>();

    const acceptCompleted = (_result: ParsedArguments<typeof options>) => {};
    acceptCompleted(parsed);
    // @ts-expect-error 准备结果尚未证明 required，且具有不同的阶段标记
    acceptCompleted(prepared);
  });

  it("成功解析的 undefined 是合法值类型，required 仍要求该键存在", () => {
    const parseUndefined: ValueParser<undefined> = {
      parse: () => ({ ok: true, value: undefined }),
    };
    const parser = createParser([
      { long: "required", parse: parseUndefined, required: true },
      { long: "defaulted", parse: parseUndefined, defaultWhenAbsent: undefined },
      { long: "bare", parse: parseUndefined, defaultWhenBare: undefined },
    ]);
    const result = parser.parse(["--required=x"]);
    expectTypeOf<Pick<typeof result.values, "required">>().toEqualTypeOf<{
      readonly required: undefined;
    }>();
    expectTypeOf<Pick<typeof result.values, "defaulted">>().toEqualTypeOf<{
      readonly defaulted: undefined;
    }>();
    expectTypeOf<Pick<typeof result.values, "bare">>().toEqualTypeOf<{
      readonly bare?: undefined;
    }>();
  });

  it("裸用默认值不会让未出现的选项变成必有字段", () => {
    const result = createParser([
      { long: "flag", parse: values.boolean(), defaultWhenBare: true },
    ]).parse([]);
    expectTypeOf(result.values.flag).toEqualTypeOf<boolean | undefined>();
    expectTypeOf<Pick<typeof result.values, "flag">>().toEqualTypeOf<{
      readonly flag?: boolean;
    }>();
  });

  it("动态数组不会从数组元素的 required 或默认值推断每个名称存在", () => {
    const dynamic: (OptionSpec<number> & { long: "count"; required: true })[] = [];
    const result = createParser(dynamic).parse([]);
    expectTypeOf(result.values.count).toEqualTypeOf<
      number | readonly (number | undefined)[] | undefined
    >();
    expectTypeOf(result.provided.count).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(result.records.count).toEqualTypeOf<
      readonly ValueRecord<number | undefined>[] | undefined
    >();
  });

  it("宽化的 required 与 repeat 保持相应的可选值和归约联合", () => {
    function parseWith(required: boolean, repeat: Repeat) {
      return createParser([{ long: "count", parse: values.integer(), required, repeat }]).prepare(
        [],
      );
    }
    const result = parseWith(false, "append");
    expectTypeOf(result.values.count).toEqualTypeOf<number | readonly number[] | undefined>();
  });

  it("运行时选择的选项名不会把两个潜在名字同时推成必有", () => {
    function parseNamed(long: "left" | "right") {
      return createParser([{ long, parse: values.integer(), defaultWhenAbsent: 1 }]).parse([]);
    }
    const result = parseNamed("left");
    expectTypeOf(result.values.left).toEqualTypeOf<number | undefined>();
    expectTypeOf(result.values.right).toEqualTypeOf<number | undefined>();
    expectTypeOf(result.provided.left).toEqualTypeOf<boolean | undefined>();
  });

  it("备选 schema 的联合不会虚构另一个分支的默认值", () => {
    function parseChoice(left: boolean) {
      const options = left
        ? ([{ long: "left", parse: values.integer(), defaultWhenAbsent: 1 }] as const)
        : ([{ long: "right", parse: values.string(), defaultWhenAbsent: "x" }] as const);
      return createParser(options).parse([]);
    }
    const result = parseChoice(true);
    expectTypeOf(result.values.left).toEqualTypeOf<number | undefined>();
    expectTypeOf(result.values.right).toEqualTypeOf<string | undefined>();
  });

  it("混合字面量名和宽化名时，值、记录与出现都保留可能的值域", () => {
    function parseMixed(long: string) {
      return createParser([
        { long: "count", parse: values.integer(), required: true },
        { long, parse: values.string() },
      ]).parse(["--count=1"]);
    }
    const result = parseMixed("label");
    expectTypeOf(result.values.count).toEqualTypeOf<number | string | undefined>();
    expectTypeOf(result.provided.count).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(result.provided.unregistered).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(result.records.count).toEqualTypeOf<
      readonly ValueRecord<number | string>[] | undefined
    >();
    expectTypeOf<(typeof result.occurrences)[number]["values"][number]["value"]>().toEqualTypeOf<
      number | string
    >();
  });

  it("模板字符串名称域不会把未注册的潜在名称推成必有字段", () => {
    function parsePrefixed(long: `x-${string}`) {
      return createParser([{ long, parse: values.integer(), defaultWhenAbsent: 1 }]).parse([]);
    }
    function parseNumeric(long: `${number}`) {
      return createParser([{ long, parse: values.integer(), defaultWhenAbsent: 1 }]).parse([]);
    }
    const prefixed = parsePrefixed("x-registered");
    expectTypeOf(prefixed.values["x-unregistered"]).toEqualTypeOf<number | undefined>();
    expectTypeOf(prefixed.provided["x-unregistered"]).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(prefixed.records["x-unregistered"]).toEqualTypeOf<
      readonly ValueRecord<number>[] | undefined
    >();
    const numeric = parseNumeric("1");
    expectTypeOf(numeric.values["42"]).toEqualTypeOf<number | undefined>();
    expectTypeOf(numeric.provided["42"]).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(numeric.records["42"]).toEqualTypeOf<readonly ValueRecord<number>[] | undefined>();
  });

  it("联合值解析保留结果类型，append 只改变归约外形", () => {
    const parser = createParser([
      {
        long: "threshold",
        parse: values.union([values.integer(), values.enumeration(["auto", "unbounded"])]),
        repeat: "append",
      },
    ]);
    expectTypeOf(parser.parse([]).values.threshold).toEqualTypeOf<
      readonly (number | "auto" | "unbounded")[]
    >();
  });

  it("默认值不能反向扩宽解析器的值类型，包括显式 undefined", () => {
    const invalidDeclarations = () => {
      // @ts-expect-error integer 的默认值必须是 number
      createParser([{ long: "count", parse: values.integer(), defaultWhenBare: "1" }]);
      // @ts-expect-error string 的缺席默认值不能是 number
      createParser([{ long: "name", parse: values.string(), defaultWhenAbsent: 1 }]);
      // @ts-expect-error 解析器没有返回 undefined，不能设置 undefined 默认值
      createParser([{ long: "name", parse: values.string(), defaultWhenBare: undefined }]);
      // @ts-expect-error 同样检查显式 undefined 缺席默认值
      createParser([{ long: "name", parse: values.string(), defaultWhenAbsent: undefined }]);
      createParser([
        // @ts-expect-error 枚举默认值必须属于声明的成员
        { long: "mode", parse: values.enumeration(["auto", "never"]), defaultWhenBare: "always" },
      ]);
    };
    expectTypeOf(invalidDeclarations).toBeFunction();
  });
});
