import { describe, expect, it } from "vite-plus/test";

import {
  createParser,
  success,
  values,
  type ParsedArguments,
  type ValueParser,
} from "../src/index.ts";

describe("解析调用的状态隔离", () => {
  it("注册后修改原定义和回调，不改变已有解析器", () => {
    const valueParser = { parse: (raw: string) => success(raw) };
    const option = { long: "name", short: "n", parse: valueParser, defaultWhenAbsent: "initial" };
    const options = [option];
    const parser = createParser(options);
    option.long = "changed";
    option.short = "x";
    option.defaultWhenAbsent = "changed";
    valueParser.parse = () => success("replaced");
    options.length = 0;

    expect(parser.parse([]).values.name).toBe("initial");
    expect(parser.parse(["-nalice"]).values.name).toBe("alice");
  });

  it("回调期间修改调用者 argv，不改变当前扫描的后续输入", () => {
    const argv = ["--name", "alice", "original.txt"];
    const parser = createParser([
      {
        long: "name",
        parse: {
          parse: (raw: string) => {
            argv[2] = "--unknown";
            argv.push("another.txt");
            return success(raw);
          },
        },
      },
    ]);

    expect(parser.parse(argv).positionals).toEqual(["original.txt"]);
  });

  it("值回调重入同一解析器时，两次输入的值和历史互不污染", () => {
    let parseNested = () => {};
    const valueParser: ValueParser<string> = {
      parse: (raw) => {
        if (raw === "outer") parseNested();
        return success(raw);
      },
    };
    const options = [{ long: "item", parse: valueParser, repeat: "append" }] as const;
    const parser = createParser(options);
    let nested: ParsedArguments<typeof options> | undefined;
    parseNested = () => {
      nested = parser.parse(["--item=inner", "nested.txt"]);
    };

    const outer = parser.parse(["--item=outer", "outer.txt"]);
    expect(outer.values.item).toEqual(["outer"]);
    expect(outer.positionals).toEqual(["outer.txt"]);
    expect(nested?.values.item).toEqual(["inner"]);
    expect(nested?.positionals).toEqual(["nested.txt"]);
    expect(outer.occurrences).toHaveLength(1);
    expect(nested?.occurrences).toHaveLength(1);
  });

  it("默认对象按原类型保留，解析器不修改或冻结调用者的值", () => {
    const fallback = { mode: "auto" };
    const parser = createParser([
      {
        long: "config",
        parse: { parse: (raw: string) => success({ mode: raw }) },
        defaultWhenAbsent: fallback,
      },
    ]);
    const result = parser.parse([]);
    expect(result.values.config).toBe(fallback);
    expect(fallback).toEqual({ mode: "auto" });
    expect(Object.isFrozen(fallback)).toBe(false);
    expect(Object.isFrozen(result.values)).toBe(true);
    expect(Object.isFrozen(result.records.config)).toBe(true);
    expect(Object.isFrozen(result.records.config[0])).toBe(true);
  });

  it("每个成功扫描的 token 都有唯一归属，短簇共享出现位置", () => {
    const parser = createParser(
      [
        { long: "item", short: "i", parse: values.integer(), repeat: "append" },
        { long: "flag", short: "f", parse: values.boolean(), defaultWhenBare: true },
      ],
      { greedy: true },
    );
    const argv = ["before", "--item", "1", "2", "-fi3", "after", "--", "--item=4", ""];
    const result = parser.parse(argv);
    const optionIndices = new Set(result.occurrences.map((occurrence) => occurrence.index));
    const valueIndices = result.occurrences.flatMap((occurrence) =>
      occurrence.values
        .filter((record) => record.source === "separated")
        .map((record) => record.index),
    );
    const owners = [
      ...optionIndices,
      ...valueIndices,
      ...result.positionalTokens.map((token) => token.index),
      result.terminatorIndex,
    ].sort((left, right) => left! - right!);

    expect(owners).toEqual(argv.map((_, index) => index));
    expect(result.values.item).toEqual([1, 2, 3]);
    expect(result.occurrences.filter((occurrence) => occurrence.index === 4)).toHaveLength(2);
  });
});
