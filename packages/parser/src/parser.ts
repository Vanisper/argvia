import { OptionSpecError, ParseError } from "./errors.ts";
import { longNameProblem, shortNameProblem } from "./names.ts";
import type {
  CheckedOptions,
  Occurrence,
  OptionSpec,
  ParseConfig,
  ParsedArguments,
  Parser,
  PreparedArguments,
  ValueParser,
  ValueRecord,
} from "./types.ts";
import { decodeValue, snapshotValueParser } from "./values.ts";

interface RegisteredOption {
  readonly long: string;
  readonly short: string | undefined;
  readonly parse: ValueParser<unknown>;
  readonly hasBare: boolean;
  readonly bare: unknown;
  readonly hasAbsent: boolean;
  readonly absent: unknown;
  readonly required: boolean;
  readonly repeat: "last" | "append" | "error";
}

interface OptionState {
  count: number;
  retained: ValueRecord[];
}

interface OpenOccurrence {
  readonly option: RegisteredOption;
  readonly spelling: string;
  readonly token: string;
  readonly index: number;
  readonly clusterPosition: number | null;
  readonly values: ValueRecord[];
}

interface PreparedState<S extends readonly OptionSpec[]> {
  readonly provided: Readonly<Record<string, boolean>>;
  completed?: ParsedArguments<S>;
}

const quote = (value: string): string => JSON.stringify(value);

function readGreedy(config: ParseConfig | undefined): boolean {
  if (config === undefined) return false;
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new TypeError("Parser configuration must be an object.");
  }
  const greedy = config.greedy;
  if (greedy !== undefined && typeof greedy !== "boolean") {
    throw new TypeError("greedy must be a boolean.");
  }
  return greedy ?? false;
}

/** 创建作用于已确定参数范围的解析器；准备阶段延期必填检查 */
export function createParser<const S extends readonly OptionSpec[]>(
  options: S & CheckedOptions<S>,
  config?: ParseConfig,
): Parser<S> {
  if (!Array.isArray(options)) {
    throw new OptionSpecError("Option definitions must be an array.");
  }
  const greedy = readGreedy(config);
  const longNames = new Map<string, RegisteredOption>();
  const shortNames = new Map<string, RegisteredOption>();
  const registered: RegisteredOption[] = [];

  for (const definition of options) {
    if (typeof definition !== "object" || definition === null || Array.isArray(definition)) {
      throw new OptionSpecError("Each option definition must be an object.");
    }
    const long = definition.long;
    const longProblem = longNameProblem(long);
    if (longProblem !== undefined) throw new OptionSpecError(`A long name ${longProblem}.`);
    const invalid = (message: string): never => {
      throw new OptionSpecError(message, long);
    };
    const short = definition.short;
    if (short !== undefined) {
      const shortProblem = shortNameProblem(short);
      if (shortProblem !== undefined) invalid(`A short name ${shortProblem}.`);
    }
    if (longNames.has(long)) invalid(`Duplicate long name ${quote(long)}.`);
    if (short !== undefined && shortNames.has(short))
      invalid(`Duplicate short name ${quote(short)}.`);
    const required = definition.required;
    if (required !== undefined && typeof required !== "boolean")
      invalid("required must be a boolean.");
    const repeat = definition.repeat === undefined ? "last" : definition.repeat;
    if (repeat !== "last" && repeat !== "append" && repeat !== "error") {
      invalid("repeat must be 'last', 'append', or 'error'.");
    }
    const valueParser = definition.parse;
    if (
      ((typeof valueParser !== "object" || valueParser === null) &&
        typeof valueParser !== "function") ||
      typeof valueParser.parse !== "function" ||
      (valueParser.normalize !== undefined && typeof valueParser.normalize !== "function")
    ) {
      invalid("An option needs a value parser with parse() and optional normalize().");
    }
    const hasBare = Object.hasOwn(definition, "defaultWhenBare");
    const hasAbsent = Object.hasOwn(definition, "defaultWhenAbsent");
    if (
      (!hasBare && "defaultWhenBare" in definition) ||
      (!hasAbsent && "defaultWhenAbsent" in definition)
    ) {
      invalid("Default values must be own properties of the option definition.");
    }
    if (hasAbsent && required === true)
      invalid("required cannot be combined with defaultWhenAbsent.");
    if (hasAbsent && repeat === "append")
      invalid("append cannot be combined with defaultWhenAbsent.");
    const option: RegisteredOption = Object.freeze({
      long,
      short,
      parse: snapshotValueParser(valueParser),
      hasBare,
      bare: hasBare ? definition.defaultWhenBare : undefined,
      hasAbsent,
      absent: hasAbsent ? definition.defaultWhenAbsent : undefined,
      required: required ?? false,
      repeat,
    });
    registered.push(option);
    longNames.set(long, option);
    if (short !== undefined) shortNames.set(short, option);
  }
  const definitions = Object.freeze(registered);
  const preparedStates = new WeakMap<PreparedArguments<S>, PreparedState<S>>();

  // 此处只识别短簇首成员，后续成员到其扫描位置再校验
  function isRegistered(token: string): boolean {
    if (token === "--" || token === "-") return false;
    if (token.startsWith("--")) {
      const equals = token.indexOf("=", 2);
      return longNames.has(token.slice(2, equals < 0 ? undefined : equals));
    }
    if (!token.startsWith("-")) return false;
    const point = token.codePointAt(1);
    return point !== undefined && shortNames.has(String.fromCodePoint(point));
  }

  function prepare(input: readonly string[]): PreparedArguments<S> {
    if (!Array.isArray(input)) throw new TypeError("argv must be an array of strings.");
    const argv: readonly string[] = [...input];
    for (const token of argv) {
      if (typeof token !== "string") throw new TypeError("Every argv element must be a string.");
    }
    const states = new Map<RegisteredOption, OptionState>(
      definitions.map((option) => [option, { count: 0, retained: [] }]),
    );
    const occurrences: OpenOccurrence[] = [];
    const positionalTokens: { readonly raw: string; readonly index: number }[] = [];
    let terminatorIndex: number | null = null;
    let cursor = 0;

    function begin(
      option: RegisteredOption,
      spelling: string,
      token: string,
      index: number,
      clusterPosition: number | null,
    ): OpenOccurrence {
      const state = states.get(option)!;
      if (state.count > 0 && option.repeat === "error") {
        throw new ParseError(
          "DuplicateOption",
          `Option ${quote(`--${option.long}`)} may only appear once.`,
          {
            option: option.long,
            token,
            index,
            ...(clusterPosition === null ? {} : { clusterPosition }),
          },
        );
      }
      state.count += 1;
      const occurrence = {
        option,
        spelling,
        token,
        index,
        clusterPosition,
        values: [] as ValueRecord[],
      };
      occurrences.push(occurrence);
      return occurrence;
    }

    function retain(occurrence: OpenOccurrence, record: ValueRecord): void {
      const frozen = Object.freeze(record);
      occurrence.values.push(frozen);
      const state = states.get(occurrence.option)!;
      if (occurrence.option.repeat === "append") state.retained.push(frozen);
      else state.retained = [frozen];
    }

    function bareOrMissing(occurrence: OpenOccurrence): void {
      const option = occurrence.option;
      if (option.hasBare) {
        retain(occurrence, {
          value: option.bare,
          raw: null,
          normalized: null,
          source: "bare-default",
          index: null,
        });
        return;
      }
      const nextToken = argv[cursor];
      const binding =
        nextToken !== undefined && isRegistered(nextToken)
          ? `Pass it as a value with ${quote(`--${option.long}=${nextToken}`)}.`
          : undefined;
      throw new ParseError(
        "MissingValue",
        `Missing value for option ${quote(`--${option.long}`)}.`,
        {
          option: option.long,
          token: occurrence.token,
          index: occurrence.index,
          ...(occurrence.clusterPosition === null
            ? {}
            : { clusterPosition: occurrence.clusterPosition }),
          ...(nextToken === undefined ? {} : { nextToken, nextIndex: cursor }),
          ...(binding === undefined ? {} : { hint: binding }),
        },
      );
    }

    function decode(
      occurrence: OpenOccurrence,
      raw: string,
      token: string,
      index: number,
      source: "equals" | "attached" | "separated",
      canDecline: boolean,
    ): boolean {
      const { normalized, result } = decodeValue(occurrence.option.parse, raw);
      if (!result.ok) {
        if (canDecline) return false;
        throw new ParseError(
          "InvalidValue",
          `Invalid value ${quote(raw)} for option ${quote(`--${occurrence.option.long}`)}; expected ${quote(result.expected)}.`,
          {
            option: occurrence.option.long,
            token,
            index,
            raw,
            expected: result.expected,
            ...(occurrence.clusterPosition === null
              ? {}
              : { clusterPosition: occurrence.clusterPosition }),
            ...(result.reason === undefined ? {} : { reason: result.reason }),
          },
        );
      }
      retain(occurrence, { value: result.value, raw, normalized, source, index });
      return true;
    }

    function following(occurrence: OpenOccurrence): void {
      const option = occurrence.option;
      const first = argv[cursor];
      if (
        first === undefined ||
        first === "--" ||
        isRegistered(first) ||
        (!greedy && option.hasBare)
      ) {
        bareOrMissing(occurrence);
        return;
      }
      if (!decode(occurrence, first, first, cursor, "separated", option.hasBare)) {
        bareOrMissing(occurrence);
        return;
      }
      cursor += 1;
      if (!greedy || option.repeat !== "append") return;
      while (cursor < argv.length) {
        const candidate = argv[cursor]!;
        if (candidate === "--" || isRegistered(candidate)) return;
        if (!decode(occurrence, candidate, candidate, cursor, "separated", true)) return;
        cursor += 1;
      }
    }

    while (cursor < argv.length) {
      const index = cursor;
      const token = argv[cursor++]!;
      if (token === "--") {
        terminatorIndex = index;
        while (cursor < argv.length) {
          positionalTokens.push(Object.freeze({ raw: argv[cursor]!, index: cursor }));
          cursor += 1;
        }
      } else if (token.startsWith("--")) {
        const equals = token.indexOf("=", 2);
        const name = token.slice(2, equals < 0 ? undefined : equals);
        const option = longNames.get(name);
        if (option === undefined) {
          throw new ParseError(
            "UnknownOption",
            `Unknown long option ${quote(name)} in ${quote(token)}.`,
            { option: name, token, index },
          );
        }
        const occurrence = begin(option, `--${name}`, token, index, null);
        if (equals < 0) following(occurrence);
        else decode(occurrence, token.slice(equals + 1), token, index, "equals", false);
      } else if (token.startsWith("-") && token !== "-") {
        const points = Array.from(token.slice(1));
        for (let position = 0; position < points.length; position += 1) {
          const name = points[position]!;
          const option = shortNames.get(name);
          if (option === undefined) {
            throw new ParseError(
              "UnknownOption",
              `Unknown short option ${quote(name)} in ${quote(token)}.`,
              {
                option: name,
                token,
                index,
                clusterPosition: position,
              },
            );
          }
          const occurrence = begin(option, `-${name}`, token, index, position);
          const last = position === points.length - 1;
          if (!last && option.hasBare) {
            bareOrMissing(occurrence);
            continue;
          }
          if (last) following(occurrence);
          else
            decode(
              occurrence,
              points.slice(position + 1).join(""),
              token,
              index,
              "attached",
              false,
            );
          break;
        }
      } else {
        positionalTokens.push(Object.freeze({ raw: token, index }));
      }
    }

    const values: Record<string, unknown> = Object.create(null);
    const provided: Record<string, boolean> = Object.create(null);
    const records: Record<string, readonly ValueRecord[]> = Object.create(null);
    for (const option of definitions) {
      const state = states.get(option)!;
      provided[option.long] = state.count > 0;
      if (state.count === 0 && option.hasAbsent) {
        state.retained.push(
          Object.freeze({
            value: option.absent,
            raw: null,
            normalized: null,
            source: "absent-default",
            index: null,
          }),
        );
      }
      records[option.long] = Object.freeze(state.retained);
      if (option.repeat === "append") {
        values[option.long] = Object.freeze(state.retained.map((record) => record.value));
      } else if (state.retained.length > 0) {
        values[option.long] = state.retained[0]!.value;
      }
    }
    const history: readonly Occurrence[] = Object.freeze(
      occurrences.map((occurrence) =>
        Object.freeze({
          option: occurrence.option.long,
          spelling: occurrence.spelling,
          optionToken: occurrence.token,
          index: occurrence.index,
          clusterPosition: occurrence.clusterPosition,
          values: Object.freeze(occurrence.values),
        }),
      ),
    );
    const prepared = Object.freeze({
      values: Object.freeze(values),
      provided: Object.freeze(provided),
      records: Object.freeze(records),
      occurrences: history,
      positionals: Object.freeze(positionalTokens.map((token) => token.raw)),
      positionalTokens: Object.freeze(positionalTokens),
      terminatorIndex,
    }) as unknown as PreparedArguments<S>;
    preparedStates.set(prepared, { provided });
    return prepared;
  }

  function complete(prepared: PreparedArguments<S>): ParsedArguments<S> {
    const state = preparedStates.get(prepared);
    if (state === undefined) {
      throw new TypeError("complete() requires a prepared result from this parser instance.");
    }
    if (state.completed !== undefined) return state.completed;
    for (const option of definitions) {
      if (option.required && !state.provided[option.long]) {
        throw new ParseError(
          "MissingRequired",
          `Required option ${quote(`--${option.long}`)} was not provided.`,
          { option: option.long },
        );
      }
    }
    const completed = Object.freeze({ ...prepared }) as unknown as ParsedArguments<S>;
    state.completed = completed;
    return completed;
  }

  return Object.freeze({
    prepare,
    complete,
    parse: (argv: readonly string[]) => complete(prepare(argv)),
  });
}
