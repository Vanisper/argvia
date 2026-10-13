import type { Command, CommandContext } from '@argvia/core'
import { defineCommand, option } from '@argvia/core'

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

/** init 的启动选项和局部覆盖开关 */
export const initOptions = {
  ...launchOptions,
  force: option.boolean({ default: false, description: '允许覆盖已有配置' }),
}

/** CLI 本次输入，缺省单值保留 undefined，重复值按输入顺序收集 */
export type LaunchInput = CommandContext<readonly [], typeof launchOptions>['options']

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

/** 由应用提供配置读取与业务执行，返回值交由 Argvia 的执行结果保留 */
export interface JavaRunServices {
  /** 缺少项目配置时返回空对象，读取失败时拒绝 */
  readProjectConfig: (cwd: string) => Promise<ProjectConfig>
  launch: (request: LaunchConfig) => unknown
  plan: (request: LaunchConfig) => unknown
  initialize: (request: InitRequest) => unknown
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

/** 创建依赖由调用方提供的 java-run 场景命令 */
export function createJavaRunCommand(
  services: JavaRunServices,
  environment: JavaRunEnvironment,
): Command {
  async function resolveConfiguredInput(cli: LaunchInput, passthrough: readonly string[]): Promise<LaunchConfig> {
    const project = await services.readProjectConfig(cli.cwd ?? environment.cwd)
    return resolveLaunchConfig(cli, project, environment, passthrough)
  }

  return defineCommand({
    name: 'java-run',
    description: 'Java 启动配置组合样本',
    defaultCommand: 'run',
    commands: {
      run: defineCommand({
        description: '运行应用',
        options: launchOptions,
        passthrough: true,
        async run({ options, passthrough }) {
          return services.launch(await resolveConfiguredInput(options, passthrough))
        },
      }),
      plan: defineCommand({
        description: '预览启动计划',
        options: launchOptions,
        passthrough: true,
        async run({ options, passthrough }) {
          return services.plan(await resolveConfiguredInput(options, passthrough))
        },
      }),
      init: defineCommand({
        description: '初始化项目配置',
        options: initOptions,
        passthrough: true,
        run({ options, passthrough }) {
          return services.initialize({
            ...resolveLaunchConfig(options, {}, environment, passthrough),
            force: options.force,
          })
        },
      }),
    },
  })
}
