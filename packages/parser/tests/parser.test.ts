import { describe, expect, it, vi } from "vite-plus/test";

import {
  createParser,
  OptionSpecError,
  ParseError,
  values,
  type OptionSpec,
  type ValueParser,
} from "../src/index.ts";

function inputError(run: () => unknown, code: ParseError["code"]) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ParseError);
    expect((error as ParseError).code).toBe(code);
    return error as ParseError;
  }
  throw new Error(`Expected ${code}`);
}

function baseline(greedy = false) {
  return createParser(
    [
      { long: "name", short: "n", parse: values.string() },
      { long: "count", short: "c", parse: values.integer() },
      { long: "item", short: "i", parse: values.integer(), repeat: "append" },
      { long: "enabled", short: "e", parse: values.boolean(), defaultWhenBare: true },
      { long: "verbose", short: "v", parse: values.boolean(), defaultWhenBare: true },
      { long: "help", short: "h", parse: values.boolean(), defaultWhenBare: true },
      { long: "version", parse: values.boolean(), defaultWhenBare: true },
      { long: "jvm-arg", parse: values.string() },
      {
        long: "color",
        parse: values.enumeration(["auto", "always", "never"]),
        defaultWhenBare: "always",
      },
    ],
    { greedy },
  );
}

describe("规范 11.2：绑定与识别", () => {
  const cases = [
    { argv: ["--name", "alice"], expected: { name: "alice" } },
    { argv: ["--name=alice"], expected: { name: "alice" } },
    { argv: ["-n", "alice"], expected: { name: "alice" } },
    { argv: ["-nalice"], expected: { name: "alice" } },
    { argv: ["--name="], expected: { name: "" } },
    { argv: ["--name", ""], expected: { name: "" } },
    { argv: ["--name=a=b"], expected: { name: "a=b" } },
    { argv: ["--name", "a=b"], expected: { name: "a=b" } },
    { argv: ["--count", "-1"], expected: { count: -1 } },
    { argv: ["--count=-1"], expected: { count: -1 } },
    { argv: ["-c", "-1"], expected: { count: -1 } },
    { argv: ["-c-1"], expected: { count: -1 } },
    { argv: ["--jvm-arg", "-Xmx1g"], expected: { "jvm-arg": "-Xmx1g" } },
    { argv: ["--jvm-arg=-Xmx1g"], expected: { "jvm-arg": "-Xmx1g" } },
    { argv: ["--name", "--unknown"], expected: { name: "--unknown" } },
    { argv: ["--name=--help"], expected: { name: "--help" } },
    { argv: ["-n--help"], expected: { name: "--help" } },
    { argv: ["--name=--"], expected: { name: "--" } },
    { argv: ["-n--"], expected: { name: "--" } },
    { argv: ["--name", "-"], expected: { name: "-" } },
    { argv: ["--name", "=v"], expected: { name: "=v" } },
    { argv: ["--", "-1", "--help"], expected: {}, positionals: ["-1", "--help"] },
    { argv: ["-"], expected: {}, positionals: ["-"] },
    { argv: ["=v"], expected: {}, positionals: ["=v"] },
    { argv: ["a.txt", "--version"], expected: { version: true }, positionals: ["a.txt"] },
    {
      argv: ["before", "--name", "'quoted value'", "after"],
      expected: { name: "'quoted value'" },
      positionals: ["before", "after"],
    },
  ];

  it.each(cases)("$argv", ({ argv, expected, positionals = [] }) => {
    const result = baseline().parse(argv);
    expect(result.values).toMatchObject(expected);
    expect(result.positionals).toEqual(positionals);
  });

  it.each([
    { argv: ["-c=5"], code: "InvalidValue" },
    { argv: ["--unknown"], code: "UnknownOption" },
    { argv: ["--name", "--help"], code: "MissingValue" },
    { argv: ["--name", "-h"], code: "MissingValue" },
    { argv: ["--name"], code: "MissingValue" },
    { argv: ["--count", "abc"], code: "InvalidValue" },
    { argv: ["--name", "--", "value"], code: "MissingValue" },
    { argv: ["-1"], code: "UnknownOption" },
    { argv: ["--=v"], code: "UnknownOption" },
    { argv: ["--NAME=alice"], code: "UnknownOption" },
  ] as const)("$argv → $code", ({ argv, code }) => {
    inputError(() => baseline().parse(argv), code);
  });

  it("注册数字短名后，分离负数触发缺值；显式绑定保持可用", () => {
    const parser = createParser([
      { long: "count", short: "c", parse: values.integer() },
      { long: "one", short: "1", parse: values.boolean(), defaultWhenBare: true },
    ]);
    inputError(() => parser.parse(["--count", "-1"]), "MissingValue");
    expect(parser.parse(["--count=-1"]).values.count).toBe(-1);
    expect(parser.parse(["-c-1"]).values.count).toBe(-1);
  });

  it("字符串参数已经完成 shell 分词，不剥离引号或执行替换", () => {
    const raw = '"$HOME\\some path"';
    expect(baseline().parse(["--name", raw]).values.name).toBe(raw);
  });
});

describe("规范 5.4：完整 greedy × repeat × 裸用默认值矩阵", () => {
  for (const greedy of [false, true]) {
    for (const repeat of ["last", "error", "append"] as const) {
      for (const hasBare of [false, true]) {
        describe(`greedy=${greedy}, repeat=${repeat}, bare=${hasBare}`, () => {
          function parser() {
            return createParser(
              [
                {
                  long: "item",
                  short: "i",
                  parse: values.integer(),
                  repeat,
                  ...(hasBare ? { defaultWhenBare: 0 } : {}),
                },
                { long: "help", short: "h", parse: values.boolean(), defaultWhenBare: true },
              ],
              { greedy },
            );
          }

          it("分离值的首值、后续值和位置参数遵循矩阵", () => {
            const result = parser().parse(["--item", "1", "2", "stop"]);
            const usesDefault = hasBare && !greedy;
            const receivesMany = repeat === "append" && greedy;
            const accepted = usesDefault ? [0] : receivesMany ? [1, 2] : [1];
            expect(result.values.item).toEqual(repeat === "append" ? accepted : accepted[0]);
            expect(result.positionals).toEqual(
              usesDefault ? ["1", "2", "stop"] : receivesMany ? ["stop"] : ["2", "stop"],
            );
            expect(result.occurrences).toHaveLength(1);
            expect(result.occurrences[0]?.values.map((record) => record.value)).toEqual(accepted);
          });

          it("首个候选无法解析时，有裸用默认值才可以回退", () => {
            if (!hasBare) {
              inputError(() => parser().parse(["--item", "stop"]), "InvalidValue");
              return;
            }
            const result = parser().parse(["--item", "stop"]);
            expect(result.values.item).toEqual(repeat === "append" ? [0] : 0);
            expect(result.positionals).toEqual(["stop"]);
          });

          it("输入末尾结算裸出现", () => {
            if (!hasBare) {
              inputError(() => parser().parse(["--item"]), "MissingValue");
              return;
            }
            expect(parser().parse(["--item"]).values.item).toEqual(repeat === "append" ? [0] : 0);
          });

          it.each(["--help", "-h"])("已注册选项 %s 必须先阻断消费", (next) => {
            if (!hasBare) {
              inputError(() => parser().parse(["--item", next]), "MissingValue");
              return;
            }
            const result = parser().parse(["--item", next]);
            expect(result.values.item).toEqual(repeat === "append" ? [0] : 0);
            expect(result.values.help).toBe(true);
          });

          it("独立终止符不可作为分离值", () => {
            if (!hasBare) {
              inputError(() => parser().parse(["--item", "--", "1"]), "MissingValue");
              return;
            }
            const result = parser().parse(["--item", "--", "1"]);
            expect(result.values.item).toEqual(repeat === "append" ? [0] : 0);
            expect(result.positionals).toEqual(["1"]);
          });

          it("长名等号绑定始终只贡献一个值", () => {
            const result = parser().parse(["--item=1", "2"]);
            expect(result.values.item).toEqual(repeat === "append" ? [1] : 1);
            expect(result.positionals).toEqual(["2"]);
          });

          if (!hasBare) {
            it("短名粘连始终只贡献一个值", () => {
              const result = parser().parse(["-i1", "2"]);
              expect(result.values.item).toEqual(repeat === "append" ? [1] : 1);
              expect(result.positionals).toEqual(["2"]);
            });
          }
        });
      }
    }
  }

  it("贪婪追加的后续非法普通值只结束追加，首值非法仍报错", () => {
    const parser = baseline(true);
    expect(parser.parse(["--item", "1", "abc"]).values.item).toEqual([1]);
    expect(parser.parse(["--item", "1", "abc"]).positionals).toEqual(["abc"]);
    inputError(() => parser.parse(["--item", "abc"]), "InvalidValue");
    inputError(() => parser.parse(["--item", "1", "--unknown"]), "UnknownOption");
  });

  it("有裸用默认值时，非贪婪分离候选不调用值回调", () => {
    const parse = vi.fn((_raw: string) => ({ ok: true as const, value: 9 }));
    const normalize = vi.fn((raw: string) => raw.trim());
    const parser = createParser([
      { long: "value", parse: { parse, normalize }, defaultWhenBare: 0 },
    ]);
    const result = parser.parse(["--value", "9"]);
    expect(result.values.value).toBe(0);
    expect(result.positionals).toEqual(["9"]);
    expect(parse).not.toHaveBeenCalled();
    expect(normalize).not.toHaveBeenCalled();
  });
});

describe("规范 4.2 与 11.3：短选项簇", () => {
  it.each([
    { argv: ["-vc5"], expected: { verbose: true, count: 5 } },
    { argv: ["-vc", "5"], expected: { verbose: true, count: 5 } },
    { argv: ["-hvc", "5"], expected: { help: true, verbose: true, count: 5 } },
    { argv: ["-hv"], expected: { help: true, verbose: true } },
  ])("$argv", ({ argv, expected }) => {
    expect(baseline().parse(argv).values).toMatchObject(expected);
  });

  it("簇末尾的裸用选项仍可取得贪婪分离值", () => {
    expect(baseline(true).parse(["-hv", "false"]).values).toMatchObject({
      help: true,
      verbose: false,
    });
  });

  it.each([false, true])("有裸用默认值时余串是短名，greedy=%s", (greedy) => {
    inputError(() => baseline(greedy).parse(["-v5"]), "UnknownOption");
  });

  it("无裸用默认值时，余串全部属于值，不再扫描其中的短名", () => {
    inputError(() => baseline().parse(["-c5x"]), "InvalidValue");
    expect(baseline().parse(["-n-hv"]).values.name).toBe("-hv");
  });

  it("仅簇首短名参与前一个待值选项的已注册识别", () => {
    inputError(() => baseline().parse(["--name", "-vZ"]), "MissingValue");
    inputError(() => baseline().parse(["--enabled", "-vZ"]), "UnknownOption");
    expect(baseline().parse(["--name=-vZ"]).values.name).toBe("-vZ");
  });
});

describe("默认值、重复与存在性", () => {
  it("缺席、裸用和显式值分别保留来源，缺席默认值不产生出现", () => {
    const parser = createParser([
      {
        long: "color",
        parse: values.enumeration(["auto", "always", "never"]),
        defaultWhenBare: "always",
        defaultWhenAbsent: "auto",
      },
    ]);
    const absent = parser.parse([]);
    expect(absent.values.color).toBe("auto");
    expect(absent.provided.color).toBe(false);
    expect(absent.occurrences).toEqual([]);
    expect(absent.records.color).toEqual([
      { value: "auto", raw: null, normalized: null, source: "absent-default", index: null },
    ]);
    expect(parser.parse(["--color"]).values.color).toBe("always");
    expect(parser.parse(["--color=never"]).values.color).toBe("never");
  });

  it("false、0、空串和 undefined 默认值均按字段存在性处理", () => {
    const optionalUndefined: ValueParser<undefined> = {
      parse: () => ({ ok: true, value: undefined }),
    };
    const parser = createParser([
      { long: "bool", parse: values.boolean(), defaultWhenBare: false },
      { long: "zero", parse: values.integer(), defaultWhenBare: 0 },
      { long: "empty", parse: values.string(), defaultWhenBare: "" },
      { long: "undefined", parse: optionalUndefined, defaultWhenBare: undefined },
      { long: "absent", parse: optionalUndefined, defaultWhenAbsent: undefined },
      { long: "missing", parse: optionalUndefined },
    ]);
    const result = parser.parse(["--bool", "--zero", "--empty", "--undefined"]);
    expect(result.values).toMatchObject({ bool: false, zero: 0, empty: "", undefined: undefined });
    expect(Object.hasOwn(result.values, "undefined")).toBe(true);
    expect(Object.hasOwn(result.values, "absent")).toBe(true);
    expect(Object.hasOwn(result.values, "missing")).toBe(false);
    expect(result.provided.absent).toBe(false);
    expect(result.provided.undefined).toBe(true);
  });

  it("显式值解析成功得到 undefined，仍保留键和显式提供标记", () => {
    const parser = createParser([
      { long: "value", required: true, parse: { parse: () => ({ ok: true, value: undefined }) } },
    ]);
    const result = parser.parse(["--value=anything"]);
    expect(Object.hasOwn(result.values, "value")).toBe(true);
    expect(result.values.value).toBeUndefined();
    expect(result.provided.value).toBe(true);
    expect(result.records.value[0]?.raw).toBe("anything");
  });

  it("last 覆盖最终值，保留长短名的完整历史", () => {
    const result = baseline().parse(["--name", "alice", "-nbob"]);
    expect(result.values.name).toBe("bob");
    expect(result.records.name.map((record) => record.value)).toEqual(["bob"]);
    expect(
      result.occurrences.flatMap((occurrence) => occurrence.values.map((record) => record.value)),
    ).toEqual(["alice", "bob"]);
    expect(result.occurrences.map((occurrence) => occurrence.spelling)).toEqual(["--name", "-n"]);
  });

  it("append 合并多次出现和单次贪婪接收，空输入得到独立空数组", () => {
    const parser = baseline(true);
    const result = parser.parse(["--item", "1", "2", "-i3"]);
    expect(result.values.item).toEqual([1, 2, 3]);
    expect(result.occurrences.map((occurrence) => occurrence.values.length)).toEqual([2, 1]);
    const first = parser.parse([]);
    const second = parser.parse([]);
    expect(first.values.item).toEqual([]);
    expect(second.values.item).toEqual([]);
    expect(first.values.item).not.toBe(second.values.item);
    expect(parser.parse(["-i4"]).values.item).toEqual([4]);
    expect(result.values.item).toEqual([1, 2, 3]);
  });

  it("有裸用默认值的 required 选项可用裸出现满足要求", () => {
    const parser = createParser([
      { long: "color", parse: values.string(), defaultWhenBare: "always", required: true },
    ]);
    inputError(() => parser.parse([]), "MissingRequired");
    expect(parser.parse(["--color"]).values.color).toBe("always");
  });
});

describe("规范 8.3：错误优先级", () => {
  it("先结算待值，再处理同一选项的重复", () => {
    const parser = createParser([{ long: "count", parse: values.integer(), repeat: "error" }]);
    inputError(() => parser.parse(["--count", "--count"]), "MissingValue");
  });

  it("已知选项第二次出现先报重复，不解析其非法值", () => {
    const parse = vi.fn(values.integer().parse);
    const parser = createParser([{ long: "count", short: "c", parse: { parse }, repeat: "error" }]);
    inputError(() => parser.parse(["--count", "1", "-c=bad"]), "DuplicateOption");
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenLastCalledWith("1");
  });

  it("先报告注册顺序中的第一个 required，输入缺值又先于 required", () => {
    const parser = createParser([
      { long: "first", parse: values.string(), required: true },
      { long: "second", parse: values.string(), required: true },
      { long: "count", parse: values.integer() },
    ]);
    expect(inputError(() => parser.parse([]), "MissingRequired").option).toBe("first");
    expect(inputError(() => parser.parse(["--count"]), "MissingValue").option).toBe("count");
  });

  it("错误保留相关选项、原始参数和位置，并提供显式绑定提示", () => {
    const error = inputError(() => baseline().parse(["file", "--name", "--help"]), "MissingValue");
    expect(error.option).toBe("name");
    expect(error.hint).toContain("--name=--help");
    expect(error.token).toBe("--name");
    expect(error.index).toBe(1);
    expect(error.nextToken).toBe("--help");
    expect(error.nextIndex).toBe(2);
    const invalid = inputError(() => baseline().parse(["--count=bad"]), "InvalidValue");
    expect(invalid.option).toBe("count");
    expect(invalid.message).toContain("bad");
    expect(invalid.raw).toBe("bad");
    expect(invalid.index).toBe(0);
    expect(invalid.expected).toContain("integer");
  });
});

describe("来源、Unicode 与安全键", () => {
  it("保留原始值、归一化值、绑定来源和每个参数单元的下标", () => {
    const parser = createParser([
      { long: "name", short: "n", parse: values.normalized(values.string(), (raw) => raw.trim()) },
      { long: "flag", short: "f", parse: values.boolean(), defaultWhenBare: true },
      { long: "fallback", parse: values.string(), defaultWhenAbsent: "auto" },
    ]);
    const result = parser.parse([
      "before",
      "--name= A ",
      "-fnB",
      "--name",
      " C ",
      "--",
      "--flag",
      "",
    ]);
    const history = result.occurrences
      .filter((occurrence) => occurrence.option === "name")
      .flatMap((occurrence) => occurrence.values);
    expect(history).toEqual([
      { value: "A", raw: " A ", normalized: "A", source: "equals", index: 1 },
      { value: "B", raw: "B", normalized: "B", source: "attached", index: 2 },
      { value: "C", raw: " C ", normalized: "C", source: "separated", index: 4 },
    ]);
    expect(result.records.name).toEqual([history[2]]);
    expect(result.records.flag).toEqual([
      { value: true, raw: null, normalized: null, source: "bare-default", index: null },
    ]);
    expect(
      result.occurrences.map(({ option, spelling, optionToken, index, clusterPosition }) => ({
        option,
        spelling,
        optionToken,
        index,
        clusterPosition,
      })),
    ).toEqual([
      {
        option: "name",
        spelling: "--name",
        optionToken: "--name= A ",
        index: 1,
        clusterPosition: null,
      },
      { option: "flag", spelling: "-f", optionToken: "-fnB", index: 2, clusterPosition: 0 },
      { option: "name", spelling: "-n", optionToken: "-fnB", index: 2, clusterPosition: 1 },
      {
        option: "name",
        spelling: "--name",
        optionToken: "--name",
        index: 3,
        clusterPosition: null,
      },
    ]);
    expect(result.positionals).toEqual(["before", "--flag", ""]);
    expect(result.positionalTokens).toEqual([
      { raw: "before", index: 0 },
      { raw: "--flag", index: 6 },
      { raw: "", index: 7 },
    ]);
    expect(result.terminatorIndex).toBe(5);
    expect(result.provided.fallback).toBe(false);
  });

  it("短名长度、簇位置和粘连切分全部采用 Unicode 码点", () => {
    const parser = createParser([
      { long: "flag", short: "🚀", parse: values.boolean(), defaultWhenBare: true },
      { long: "count", short: "数", parse: values.integer() },
    ]);
    const result = parser.parse(["-🚀数12"]);
    expect(result.values).toMatchObject({ flag: true, count: 12 });
    expect(
      result.occurrences.map(({ spelling, clusterPosition }) => ({ spelling, clusterPosition })),
    ).toEqual([
      { spelling: "-🚀", clusterPosition: 0 },
      { spelling: "-数", clusterPosition: 1 },
    ]);
    inputError(() => parser.parse(["-🚀X"]), "UnknownOption");
  });

  it("查表不把继承属性当注册名，危险结果键也不得污染原型", () => {
    const empty = createParser([]);
    for (const name of ["constructor", "toString", "__proto__"]) {
      inputError(() => empty.parse([`--${name}=x`]), "UnknownOption");
    }
    const parser = createParser([
      { long: "__proto__", parse: values.string() },
      { long: "constructor", parse: values.string() },
      { long: "prototype", parse: values.string() },
    ]);
    const result = parser.parse(["--__proto__=safe", "--constructor=also-safe", "--prototype=end"]);
    for (const [name, value] of [
      ["__proto__", "safe"],
      ["constructor", "also-safe"],
      ["prototype", "end"],
    ]) {
      expect(Object.hasOwn(result.values, name)).toBe(true);
      expect(result.values[name as keyof typeof result.values]).toBe(value);
      expect(Object.hasOwn(result.provided, name)).toBe(true);
      expect(Object.hasOwn(result.records, name)).toBe(true);
    }
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, "safe")).toBe(false);
  });
});

describe("构建期规格检查", () => {
  function invalid(options: unknown) {
    expect(() => createParser(options as readonly OptionSpec[])).toThrow(OptionSpecError);
  }

  it.each(["", "-bad", "with=value"])("拒绝长名 %j", (long) => {
    invalid([{ long, parse: values.string() }]);
  });

  it.each(["", "-", "ab", "é"])("拒绝不是单个合法码点的短名 %j", (short) => {
    invalid([{ long: "name", short, parse: values.string() }]);
  });

  it("拒绝长名或短名重复，但允许不同命名空间使用相同字符", () => {
    invalid([
      { long: "name", parse: values.string() },
      { long: "name", parse: values.string() },
    ]);
    invalid([
      { long: "one", short: "n", parse: values.string() },
      { long: "two", short: "n", parse: values.string() },
    ]);
    expect(() =>
      createParser([
        { long: "n", parse: values.string() },
        { long: "other", short: "n", parse: values.string() },
      ]),
    ).not.toThrow();
  });

  it("required/append 的缺席默认值冲突是规格错误，包含显式 undefined", () => {
    invalid([{ long: "value", parse: values.string(), required: true, defaultWhenAbsent: "x" }]);
    invalid([{ long: "value", parse: values.string(), repeat: "append", defaultWhenAbsent: "x" }]);
    invalid([
      { long: "value", parse: values.string(), repeat: "append", defaultWhenAbsent: undefined },
    ]);
  });

  it("拒绝未知 repeat 和不可调用的 parse", () => {
    invalid([{ long: "value", parse: values.string(), repeat: "merge" }]);
    invalid([{ long: "value", parse: { parse: 1 } }]);
  });
});

describe("prepare / complete：只延期必填检查", () => {
  it("prepare 保留默认值和所有来源；complete 才检查 required", () => {
    const parser = createParser([
      { long: "target", parse: values.string(), required: true },
      { long: "help", parse: values.boolean(), defaultWhenBare: true },
      { long: "format", parse: values.string(), defaultWhenAbsent: "text" },
      { long: "item", parse: values.integer(), repeat: "append" },
    ]);
    const prepared = parser.prepare(["file", "--help", "--", "--target"]);
    expect(Object.hasOwn(prepared.values, "target")).toBe(false);
    expect(prepared.values).toMatchObject({ help: true, format: "text", item: [] });
    expect(prepared.provided.target).toBe(false);
    expect(prepared.positionals).toEqual(["file", "--target"]);
    expect(prepared.terminatorIndex).toBe(2);
    inputError(() => parser.complete(prepared), "MissingRequired");
    inputError(() => parser.parse(["--help"]), "MissingRequired");
  });

  it.each([
    { argv: ["--help", "--unknown"], code: "UnknownOption" },
    { argv: ["--unknown", "--help"], code: "UnknownOption" },
    { argv: ["--count=bad", "--help"], code: "InvalidValue" },
    { argv: ["--help", "--count=bad"], code: "InvalidValue" },
    { argv: ["--count", "--help"], code: "MissingValue" },
    { argv: ["--help", "--help"], code: "DuplicateOption" },
  ] as const)("帮助无法绕过 $code：$argv", ({ argv, code }) => {
    const parser = createParser([
      { long: "target", parse: values.string(), required: true },
      { long: "count", parse: values.integer() },
      { long: "help", parse: values.boolean(), defaultWhenBare: true, repeat: "error" },
    ]);
    inputError(() => parser.prepare(argv), code);
  });

  it("帮助形态的显式值和终止符后参数都不变成帮助出现", () => {
    const parser = createParser([
      { long: "name", parse: values.string() },
      { long: "help", parse: values.boolean(), defaultWhenBare: true },
    ]);
    expect(parser.prepare(["--name=--help"]).provided.help).toBe(false);
    expect(parser.prepare(["--", "--help"]).provided.help).toBe(false);
  });

  it("complete 可重复调用，不再扫描或执行 normalize/parse 回调", () => {
    const normalize = vi.fn((raw: string) => raw.trim());
    const parse = vi.fn((raw: string) => ({ ok: true as const, value: raw }));
    const parser = createParser([{ long: "name", parse: { normalize, parse }, required: true }]);
    const argv = ["--name", " alice "];
    const prepared = parser.prepare(argv);
    argv[1] = "changed";
    const first = parser.complete(prepared);
    const second = parser.complete(prepared);
    expect(first.values.name).toBe("alice");
    expect(second).toEqual(first);
    expect(prepared.records.name[0]?.raw).toBe(" alice ");
    expect(normalize).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(first).toEqual(parser.parse(["--name", " alice "]));
    expect(normalize).toHaveBeenCalledTimes(2);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("一次贪婪消费的成功结果只解析一次，停止候选只探测一次", () => {
    const parse = vi.fn(values.integer().parse);
    const normalize = vi.fn((raw: string) => raw);
    const parser = createParser([{ long: "item", parse: { normalize, parse }, repeat: "append" }], {
      greedy: true,
    });
    const prepared = parser.prepare(["--item", "1", "2", "stop"]);
    expect(parser.complete(prepared).values.item).toEqual([1, 2]);
    expect(parse.mock.calls.map(([raw]) => raw)).toEqual(["1", "2", "stop"]);
    expect(normalize).toHaveBeenCalledTimes(3);
  });

  it("另一实例、浅拷贝和伪造对象不能进入 complete", () => {
    const options = [{ long: "name", parse: values.string() }] as const;
    const first = createParser(options);
    const second = createParser(options);
    const prepared = first.prepare([]);
    expect(() => second.complete(prepared)).toThrow();
    expect(() => first.complete({ ...prepared })).toThrow();
    expect(() => first.complete({} as typeof prepared)).toThrow();
  });

  it.each(["normalize", "parse"] as const)("%s 的程序异常原样传播", (stage) => {
    const failure = new Error(`bug in ${stage}`);
    const parser = createParser([
      {
        long: "value",
        parse: {
          normalize: (raw) => {
            if (stage === "normalize") throw failure;
            return raw;
          },
          parse: () => {
            throw failure;
          },
        },
      },
    ]);
    expect(() => parser.prepare(["--value=x"])).toThrow(failure);
  });
});
