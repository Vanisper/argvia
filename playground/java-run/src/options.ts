import type { InferOptions } from '@argvia/core'
import { option } from '@argvia/core'

/** run、plan 和 init 共同接受的启动选项 */
export const launchOptions = {
  cwd: option.string({ valueName: '目录', description: '项目目录，不能为空白；省略时使用当前目录' }),
  buildTool: option.enum(['auto', 'maven', 'gradle'], { flag: '--tool', valueName: '工具', description: '构建工具' }),
  build: option.enum(['auto', 'none'], { valueName: '策略', description: '构建策略' }),
  module: option.string({ valueName: '模块', description: '单个模块名称、Gradle 路径或目录；不接受多选、排除或可选选择器' }),
  mainClass: option.string({ flag: '--main', valueName: '类全名', description: 'Java 类全名，支持 Unicode 与 $ 内部类名' }),
  jvmArgs: option.string({ flag: '--jvm-arg', multiple: true, valueName: '参数', description: '每次传入一个非空白 JVM 参数' }),
  applicationArgs: option.string({ flag: '--arg', multiple: true, valueName: '参数', description: '每次传入一个应用参数，保留空串与空白' }),
  buildArgs: option.string({ flag: '--build-arg', multiple: true, valueName: '参数', description: '每次传入一个非空白构建参数' }),
  includeTests: option.boolean({ flag: '--include-tests', description: '包含测试产物；关闭请用 --include-tests=false，取值仅支持等号形式' }),
  javaCommand: option.string({ flag: '--java', valueName: '路径', description: '本次命令的 Java 工具路径，不能为空白' }),
  buildCommand: option.string({ flag: '--build-command', valueName: '路径', description: '本次命令的构建工具路径，不能为空白' }),
}

/** 由选项定义推导的 CLI 输入，缺省标量保留 undefined */
export type LaunchInput = InferOptions<typeof launchOptions>
