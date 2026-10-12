import type { Command, CommandContext } from 'argvia'
import { defineCommand, option } from 'argvia'

/** run、plan 和 init 共同接受的标量选项 */
export const launchOptions = {
  cwd: option.string({ description: '项目目录' }),
  buildTool: option.enum(['auto', 'maven', 'gradle'], { description: '构建工具' }),
  build: option.enum(['auto', 'none'], { description: '构建策略' }),
  module: option.string({ description: '启动模块' }),
  mainClass: option.string({ description: 'Java 主类' }),
  includeTests: option.boolean({ description: '包含测试产物' }),
  javaCommand: option.string({ description: 'Java 工具路径' }),
  buildCommand: option.string({ description: '构建工具路径' }),
}

/** init 的标量选项和局部覆盖开关 */
export const initOptions = {
  ...launchOptions,
  force: option.boolean({ default: false, description: '允许覆盖已有配置' }),
}

/** CLI 本次输入的标量值，省略的选项保留 undefined */
export type LaunchInput = CommandContext<readonly [], typeof launchOptions>['options']

/** 合并项目配置并应用最终默认值后的启动请求 */
export interface LaunchConfig {
  readonly cwd: string
  readonly buildTool: 'auto' | 'maven' | 'gradle'
  readonly build: 'auto' | 'none'
  readonly module: string | undefined
  readonly mainClass: string | undefined
  readonly includeTests: boolean
  readonly javaCommand: string | undefined
  readonly buildCommand: string | undefined
}

/** 项目配置中可保存的标量设置 */
export interface ProjectConfig {
  readonly buildTool?: LaunchConfig['buildTool']
  readonly build?: LaunchConfig['build']
  readonly module?: string
  readonly mainClass?: string
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

/** 显式 CLI 标量覆盖项目配置，再补齐应用默认值 */
export function resolveLaunchConfig(
  cli: LaunchInput,
  project: ProjectConfig,
  environment: JavaRunEnvironment,
): LaunchConfig {
  return {
    cwd: cli.cwd ?? environment.cwd,
    buildTool: cli.buildTool ?? project.buildTool ?? 'auto',
    build: cli.build ?? project.build ?? 'auto',
    module: cli.module ?? project.module,
    mainClass: cli.mainClass ?? project.mainClass,
    includeTests: cli.includeTests ?? project.includeTests ?? false,
    javaCommand: cli.javaCommand,
    buildCommand: cli.buildCommand,
  }
}

/** 创建依赖由调用方提供的 java-run 标量场景命令 */
export function createJavaRunCommand(
  services: JavaRunServices,
  environment: JavaRunEnvironment,
): Command {
  async function resolveConfiguredInput(cli: LaunchInput): Promise<LaunchConfig> {
    const project = await services.readProjectConfig(cli.cwd ?? environment.cwd)
    return resolveLaunchConfig(cli, project, environment)
  }

  return defineCommand({
    name: 'java-run',
    description: 'Java 启动配置组合样本',
    commands: {
      run: defineCommand({
        description: '运行应用',
        options: launchOptions,
        async run({ options }) {
          return services.launch(await resolveConfiguredInput(options))
        },
      }),
      plan: defineCommand({
        description: '预览启动计划',
        options: launchOptions,
        async run({ options }) {
          return services.plan(await resolveConfiguredInput(options))
        },
      }),
      init: defineCommand({
        description: '初始化项目配置',
        options: initOptions,
        run({ options }) {
          return services.initialize({
            ...resolveLaunchConfig(options, {}, environment),
            force: options.force,
          })
        },
      }),
    },
  })
}
