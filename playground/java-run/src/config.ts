import type { LaunchInput } from './options.js'
import { CommandError } from '@argvia/core'

const JAVA_CLASS_NAME = /^[\p{L}\p{Nl}\p{Sc}\p{Pc}][\p{L}\p{Nl}\p{Sc}\p{Pc}\p{Mn}\p{Mc}\p{Nd}\p{Cf}]*(?:\.[\p{L}\p{Nl}\p{Sc}\p{Pc}][\p{L}\p{Nl}\p{Sc}\p{Pc}\p{Mn}\p{Mc}\p{Nd}\p{Cf}]*)*$/u

/** 合并项目配置并应用最终默认值后的启动请求 */
export interface LaunchConfig {
  readonly cwd: string
  readonly buildTool: 'auto' | 'maven' | 'gradle'
  readonly build: 'auto' | 'none'
  readonly module: string | undefined
  readonly mainClass: string | undefined
  readonly jvmArgs: string[]
  readonly applicationArgs: string[]
  readonly buildArgs: string[]
  readonly includeTests: boolean
  readonly javaCommand: string | undefined
  readonly buildCommand: string | undefined
}

/** 项目配置中可保存的启动设置 */
export interface ProjectConfig {
  readonly buildTool?: LaunchConfig['buildTool']
  readonly build?: LaunchConfig['build']
  readonly module?: string
  readonly mainClass?: string
  readonly jvmArgs?: readonly string[]
  readonly applicationArgs?: readonly string[]
  readonly buildArgs?: readonly string[]
  readonly includeTests?: boolean
}

/** 初始化请求包含局部覆盖开关 */
export interface InitRequest extends LaunchConfig {
  readonly force: boolean
}

/** 为省略 cwd 的调用提供项目目录 */
export interface JavaRunEnvironment {
  readonly cwd: string
}

function nonBlank(value: string, field: string, correction: string): string {
  if (!value.trim())
    throw new CommandError(`${field} 必须是非空字符串；${correction}`, { exitCode: 2 })
  return value
}

/** 确定读取项目配置的目录，空白目录在读取前抛出 CommandError */
export function resolveProjectDirectory(cwd: string | undefined, environment: JavaRunEnvironment): string {
  return nonBlank(cwd ?? environment.cwd, 'cwd', '请通过 --cwd 指定项目目录')
}

function moduleSelector(value: string | undefined): string | undefined {
  if (value === undefined)
    return undefined
  const selector = nonBlank(value, 'module', '请通过 --module 或项目配置 module 指定单个模块').trim()
  if (selector.includes(',') || /^[!?-]/u.test(selector))
    throw new CommandError('module 必须指定单个模块，不能多选、排除或使用可选选择器；请通过 --module 或项目配置 module 修正', { exitCode: 2 })
  return selector
}

function mainClass(value: string | undefined): string | undefined {
  if (value === undefined)
    return undefined
  nonBlank(value, 'mainClass', '请通过 --main 或项目配置 mainClass 指定合法的 Java 类全名')
  if (value.trim() !== value || !JAVA_CLASS_NAME.test(value))
    throw new CommandError('mainClass 必须是有效的 Java 类全名；请通过 --main 或项目配置 mainClass 修正', { exitCode: 2 })
  return value
}

/**
 * 合并并校验最终启动请求，无效领域值抛出 CommandError
 *
 * @description 显式 CLI 标量覆盖配置，数组依次追加 CLI 输入，应用参数最后追加透传值
 */
export function resolveLaunchConfig(
  cli: LaunchInput,
  project: ProjectConfig,
  environment: JavaRunEnvironment,
  passthrough: readonly string[] = [],
): LaunchConfig {
  return {
    cwd: resolveProjectDirectory(cli.cwd, environment),
    buildTool: cli.buildTool ?? project.buildTool ?? 'auto',
    build: cli.build ?? project.build ?? 'auto',
    module: moduleSelector(cli.module ?? project.module),
    mainClass: mainClass(cli.mainClass ?? project.mainClass),
    jvmArgs: [...(project.jvmArgs ?? []), ...cli.jvmArgs].map((value, index) => nonBlank(
      value,
      `合并后的 jvmArgs[${index}]`,
      '请检查 --jvm-arg 或项目配置 jvmArgs',
    )),
    applicationArgs: [...(project.applicationArgs ?? []), ...cli.applicationArgs, ...passthrough],
    buildArgs: [...(project.buildArgs ?? []), ...cli.buildArgs].map((value, index) => nonBlank(
      value,
      `合并后的 buildArgs[${index}]`,
      '请检查 --build-arg 或项目配置 buildArgs',
    )),
    includeTests: cli.includeTests ?? project.includeTests ?? false,
    javaCommand: cli.javaCommand === undefined ? undefined : nonBlank(cli.javaCommand, 'javaCommand', '请通过 --java 指定工具路径'),
    buildCommand: cli.buildCommand === undefined ? undefined : nonBlank(cli.buildCommand, 'buildCommand', '请通过 --build-command 指定工具路径'),
  }
}
