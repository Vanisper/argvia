import type { InferOptions } from '@argvia/core'
import { option } from '@argvia/core'

/** run、plan 和 init 共同接受的启动选项 */
export const launchOptions = {
  cwd: option.string({ description: '项目目录' }),
  buildTool: option.enum(['auto', 'maven', 'gradle'], { flag: '--tool', description: '构建工具' }),
  build: option.enum(['auto', 'none'], { description: '构建策略' }),
  module: option.string({ description: '启动模块' }),
  mainClass: option.string({ flag: '--main', description: 'Java 主类' }),
  jvmArgs: option.string({ flag: '--jvm-arg', multiple: true, description: 'JVM 参数' }),
  applicationArgs: option.string({ flag: '--arg', multiple: true, description: '应用参数' }),
  buildArgs: option.string({ flag: '--build-arg', multiple: true, description: '构建参数' }),
  includeTests: option.boolean({ flag: '--include-tests', description: '包含测试产物' }),
  javaCommand: option.string({ flag: '--java', description: 'Java 工具路径' }),
  buildCommand: option.string({ flag: '--build-command', description: '构建工具路径' }),
}

/** 由选项定义推导的 CLI 输入，缺省标量保留 undefined */
export type LaunchInput = InferOptions<typeof launchOptions>
