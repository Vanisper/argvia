import type { Command } from '@argvia/core'
import type { InitRequest, JavaRunEnvironment, LaunchConfig, ProjectConfig } from './config.js'
import type { LaunchInput } from './options.js'
import { defineCommand, exit, option } from '@argvia/core'
import { resolveLaunchConfig, resolveProjectDirectory } from './config.js'
import { launchOptions } from './options.js'

/** 由应用提供配置读取、启动状态与业务数据 */
export interface JavaRunServices {
  /** 缺少项目配置时返回空对象，读取失败时拒绝 */
  readProjectConfig: (cwd: string) => Promise<ProjectConfig>
  /** 返回启动进程的退出码，由命令显式适配为退出结果 */
  launch: (request: LaunchConfig) => number | Promise<number>
  plan: (request: LaunchConfig) => unknown
  initialize: (request: InitRequest) => unknown
}

/** 创建依赖由调用方提供的 java-run 场景命令 */
export function createJavaRunCommand(
  services: JavaRunServices,
  environment: JavaRunEnvironment,
): Command {
  async function resolveConfiguredInput(cli: LaunchInput, passthrough: readonly string[]): Promise<LaunchConfig> {
    const cwd = resolveProjectDirectory(cli.cwd, environment)
    const project = await services.readProjectConfig(cwd)
    return resolveLaunchConfig(cli, project, environment, passthrough)
  }

  return defineCommand({
    name: 'java-run',
    description: '运行 Java 应用、预览计划或初始化配置',
    defaultCommand: 'run',
    commands: {
      run: defineCommand({
        description: '运行应用',
        options: launchOptions,
        passthrough: true,
        async run({ options, passthrough }) {
          const request = await resolveConfiguredInput(options, passthrough)
          return exit(await services.launch(request))
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
        options: {
          ...launchOptions,
          force: option.boolean({ default: false, description: '允许覆盖已有配置' }),
        },
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
