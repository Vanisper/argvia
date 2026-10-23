/** 缓存一次阶段转换，包括任意值形式的异常 */
export function once<T>(operation: () => T): () => T {
  let state: { kind: "pending" } | { kind: "value"; value: T } | { kind: "error"; error: unknown } =
    { kind: "pending" };
  return () => {
    if (state.kind === "value") return state.value;
    if (state.kind === "error") throw state.error;
    try {
      const value = operation();
      state = { kind: "value", value };
      return value;
    } catch (error) {
      state = { kind: "error", error };
      throw error;
    }
  };
}

/** 复制调用输入，阶段间不再读取调用者的可变数组 */
export function snapshotArgv(input: readonly string[]): readonly string[] {
  if (!Array.isArray(input)) {
    throw new TypeError("argv must be an array of strings.");
  }
  const argv = [...input];
  if (argv.some((token) => typeof token !== "string")) {
    throw new TypeError("argv must be an array of strings.");
  }
  return Object.freeze(argv);
}
