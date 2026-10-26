// ============================================================
// 选项名称的语法判定
// ------------------------------------------------------------
// - longNameProblem / shortNameProblem 返回原因短语，合规时返回 undefined
// - 解析器与命令定义共用这一份规则，调用方补足上下文后抛出各自的错误
// ============================================================

/** 长名不得为空、以 '-' 开头或含 '=' */
export function longNameProblem(long: unknown): string | undefined {
  if (typeof long !== "string") return "must be a string";
  if (long.length === 0) return "must not be empty";
  if (long.startsWith("-")) return "must not start with '-'";
  if (long.includes("=")) return "must not contain '='";
  return undefined;
}

/** 短名为单个 Unicode 码点，且不得是单独的 '-' */
export function shortNameProblem(short: unknown): string | undefined {
  if (typeof short !== "string") return "must be a string";
  if (Array.from(short).length !== 1) return "must be one Unicode code point";
  if (short === "-") return "must not be '-'";
  return undefined;
}
