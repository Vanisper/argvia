import { describe, it, expect } from "vite-plus/test";
import { ValueParserContractError } from "../src/errors.ts";
import type { ParseResult, ValueParser } from "../src/types.ts";
import { decodeValue, failure, snapshotValueParser, success, values } from "../src/values.ts";

describe("内置值域", () => {
  it("字符串保留空字符串、空白和 Unicode", () => {
    for (const raw of ["", " \t\n", "中文😀"]) {
      expect(decodeValue(values.string(), raw)).toEqual({
        normalized: raw,
        result: { ok: true, value: raw },
      });
    }
  });

  it("整数接受有符号十进制及安全整数边界，并包含自定义区间端点", () => {
    const parser = values.integer();
    for (const raw of [
      "+12",
      "-12",
      "0002",
      `${Number.MIN_SAFE_INTEGER}`,
      `${Number.MAX_SAFE_INTEGER}`,
    ]) {
      expect(parser.parse(raw)).toEqual(success(Number(raw)));
    }
    expect(parser.parse("-0")).toEqual(success(-0));

    const bounded = values.integer({ min: -2, max: 2 });
    expect(bounded.parse("-2")).toEqual(success(-2));
    expect(bounded.parse("2")).toEqual(success(2));
    expect(bounded.parse("3").ok).toBe(false);
    expect(values.integer({ min: 2, max: 2 }).parse("2")).toEqual(success(2));
  });

  it("整数拒绝非十进制整数写法、隐式空白和不安全数值", () => {
    const parser = values.integer();
    for (const raw of [
      "",
      " ",
      " 1",
      "1 ",
      "1\n",
      "1.0",
      "1e2",
      "0x10",
      "+",
      "--1",
      "NaN",
      "Infinity",
      "9007199254740992",
      "-9007199254740992",
    ]) {
      expect(parser.parse(raw).ok, raw).toBe(false);
    }
  });

  it("非法或倒置的整数边界在声明时失败", () => {
    for (const bounds of [
      { min: 1.5 },
      { max: Number.POSITIVE_INFINITY },
      { min: Number.NaN },
      { min: Number.MIN_SAFE_INTEGER - 1 },
      { max: Number.MAX_SAFE_INTEGER + 1 },
      { min: 2, max: 1 },
    ]) {
      expect(() => values.integer(bounds)).toThrow(RangeError);
    }
  });

  it("布尔值只接受约定的大小写敏感文本", () => {
    const parser = values.boolean();
    for (const raw of ["true", "1", "yes", "on"]) expect(parser.parse(raw)).toEqual(success(true));
    for (const raw of ["false", "0", "no", "off"])
      expect(parser.parse(raw)).toEqual(success(false));
    for (const raw of ["TRUE", "False", "Yes", "", " ", "2", "true "]) {
      expect(parser.parse(raw).ok, raw).toBe(false);
    }
  });

  it("枚举保留字面量值域，且不随原始列表的修改改变", () => {
    const choices: ["dev" | "prod", ...("dev" | "prod")[]] = ["dev", "prod"];
    const parser: ValueParser<"dev" | "prod"> = values.enumeration(choices);
    choices[0] = "prod";
    choices.pop();
    expect(parser.parse("dev")).toEqual(success("dev"));
    expect(parser.parse("prod")).toEqual(success("prod"));
    expect(parser.parse("DEV")).toEqual(failure('"dev" | "prod"'));
    expect(values.enumeration([""]).parse("")).toEqual(success(""));
  });

  it("枚举与联合值域拒绝运行时传入的空列表", () => {
    expect(() => values.enumeration([] as unknown as readonly [string])).toThrow(RangeError);
    expect(() => values.union([] as unknown as readonly [ValueParser<unknown>])).toThrow(
      RangeError,
    );
  });

  it("稀疏候选列表在声明时拒绝，不延迟到首次解析", () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() => values.enumeration(sparse as unknown as readonly [string])).toThrow(TypeError);
    expect(() => values.union(sparse as unknown as readonly [ValueParser<unknown>])).toThrow(
      ValueParserContractError,
    );
  });
});

describe("值域组合", () => {
  it("联合值域按声明顺序返回首个成功，合法 undefined 也会终止尝试", () => {
    const calls: string[] = [];
    const parser: ValueParser<undefined | string> = values.union([
      {
        parse: () => {
          calls.push("first");
          return failure("first domain");
        },
      },
      {
        parse: () => {
          calls.push("second");
          return success(undefined);
        },
      },
      {
        parse: () => {
          calls.push("third");
          return success("fallback");
        },
      },
    ]);
    expect(decodeValue(parser, "input").result).toEqual(success(undefined));
    expect(calls).toEqual(["first", "second"]);
  });

  it("联合失败列出全部候选值域，各候选独立收到原始输入", () => {
    const seen: string[] = [];
    const parser = values.union([
      values.normalized(values.integer({ min: 1, max: 3 }), (raw) => {
        seen.push(raw);
        return raw.trim();
      }),
      values.normalized(values.enumeration(["auto"]), (raw) => {
        seen.push(raw);
        return raw.toLowerCase();
      }),
    ]);
    expect(parser.parse("other")).toEqual(failure('safe integer [1, 3] | "auto"'));
    expect(seen).toEqual(["other", "other"]);
    expect(parser.parse("AUTO")).toEqual(success("auto"));
    expect(parser.parse(" 2 ")).toEqual(success(2));
  });

  it("嵌套正常化先外后内，每个回调和最终解析仅执行一次", () => {
    const calls: string[] = [];
    const child: ValueParser<string> = {
      normalize(raw) {
        calls.push(`child:${raw}`);
        return raw.toLowerCase();
      },
      parse(normalized) {
        calls.push(`parse:${normalized}`);
        return success(normalized);
      },
    };
    const parser = values.normalized(child, (raw) => {
      calls.push(`outer:${raw}`);
      return raw.trim();
    });
    expect(decodeValue(parser, " YES ")).toEqual({ normalized: "yes", result: success("yes") });
    expect(calls).toEqual(["outer: YES ", "child:YES", "parse:yes"]);
  });

  it("联合候选中的非法结果不会作为普通失败吞掉", () => {
    const invalid: ValueParser<string> = { parse: () => ({ ok: true }) as ParseResult<string> };
    const parser = values.union([invalid, values.string()]);
    expect(() => decodeValue(parser, "text")).toThrow(ValueParserContractError);
  });
});

describe("值解析器协议边界", () => {
  it("快照冻结回调引用，调用时不绑定 this", () => {
    const original = {
      normalize(this: void, raw: string) {
        expect(this).toBeUndefined();
        return raw.trim();
      },
      parse(this: void, normalized: string) {
        expect(this).toBeUndefined();
        return success(normalized);
      },
    };
    const snapshot = snapshotValueParser(original);
    original.normalize = (raw) => raw.toUpperCase();
    original.parse = () => success("replaced");
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(values)).toBe(true);
    expect(decodeValue(snapshot, " text ")).toEqual({
      normalized: "text",
      result: success("text"),
    });
  });

  it("拒绝缺失或不是函数的回调", () => {
    for (const parser of [
      null,
      {},
      { parse: 1 },
      { parse: () => success("x"), normalize: "trim" },
    ]) {
      expect(() => snapshotValueParser(parser as unknown as ValueParser<unknown>)).toThrow(
        ValueParserContractError,
      );
    }
  });

  it("成功必须有自有 value 字段，显式 undefined 合法", () => {
    const inherited = Object.assign(Object.create({ value: "inherited" }), { ok: true });
    for (const result of [{ ok: true }, inherited]) {
      const parser = { parse: () => result as ParseResult<unknown> };
      expect(() => decodeValue(parser, "x")).toThrow(ValueParserContractError);
    }
    expect(decodeValue({ parse: () => success(undefined) }, "x").result).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("拒绝非结果对象、错误的 ok 判别以及非法失败描述", () => {
    for (const result of [
      undefined,
      null,
      "result",
      true,
      {},
      { ok: 1, value: 1 },
      { ok: false },
      { ok: false, expected: 1 },
      { ok: false, expected: "integer", reason: 1 },
    ]) {
      const parser = { parse: () => result as ParseResult<unknown> };
      expect(() => decodeValue(parser, "x")).toThrow(ValueParserContractError);
    }
    expect(decodeValue({ parse: () => failure("integer", "out of range") }, "x").result).toEqual({
      ok: false,
      expected: "integer",
      reason: "out of range",
    });
  });

  it("正常化必须返回字符串，外层违规时不调用子回调", () => {
    let calls = 0;
    const child: ValueParser<string> = {
      normalize: (raw) => {
        calls++;
        return raw;
      },
      parse: (raw) => {
        calls++;
        return success(raw);
      },
    };
    const invalid = (() => 1) as unknown as (raw: string) => string;
    expect(() => decodeValue({ normalize: invalid, parse: child.parse }, "x")).toThrow(
      ValueParserContractError,
    );
    expect(() => decodeValue(values.normalized(child, invalid), "x")).toThrow(
      ValueParserContractError,
    );
    expect(calls).toBe(0);
  });

  it("正常化和解析抛出的异常对象在直接调用及联合中原样传播", () => {
    const marker = { callbackError: true };
    const failingNormalize: ValueParser<string> = {
      normalize: () => {
        throw marker;
      },
      parse: () => success("unreachable"),
    };
    const failingParse: ValueParser<string> = {
      parse: () => {
        throw marker;
      },
    };
    for (const parser of [
      failingNormalize,
      failingParse,
      values.union([failingParse, values.string()]),
      values.normalized(failingNormalize, (raw) => raw),
    ]) {
      let caught: unknown;
      try {
        decodeValue(parser, "x");
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(marker);
    }
  });
});
