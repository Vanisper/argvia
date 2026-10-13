import type { LaunchInput } from './options.js'

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

/** 显式 CLI 标量覆盖配置，数组依次追加 CLI 输入，应用参数最后追加透传值 */
export function resolveLaunchConfig(
  cli: LaunchInput,
  project: ProjectConfig,
  environment: JavaRunEnvironment,
  passthrough: readonly string[] = [],
): LaunchConfig {
  return {
    cwd: cli.cwd ?? environment.cwd,
    buildTool: cli.buildTool ?? project.buildTool ?? 'auto',
    build: cli.build ?? project.build ?? 'auto',
    module: cli.module ?? project.module,
    mainClass: cli.mainClass ?? project.mainClass,
    jvmArgs: [...(project.jvmArgs ?? []), ...cli.jvmArgs],
    applicationArgs: [...(project.applicationArgs ?? []), ...cli.applicationArgs, ...passthrough],
    buildArgs: [...(project.buildArgs ?? []), ...cli.buildArgs],
    includeTests: cli.includeTests ?? project.includeTests ?? false,
    javaCommand: cli.javaCommand,
    buildCommand: cli.buildCommand,
  }
}
