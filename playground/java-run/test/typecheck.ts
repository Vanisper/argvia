import type { Command } from '@argvia/core'
import type { JavaRunServices } from '../src/app.js'
import type { InitRequest, LaunchConfig } from '../src/config.js'
import type { LaunchInput } from '../src/options.js'
import { defineCommand, option } from '@argvia/core'
import { expectTypeOf } from 'vitest'
import { createJavaRunCommand } from '../src/app.js'
import { resolveLaunchConfig } from '../src/config.js'
import { launchOptions } from '../src/options.js'

/** 检查共享定义和配置组合的类型，负例只参与编译检查 */
export function verifyJavaRunTypes(): void {
  const runCommand = defineCommand({
    options: launchOptions,
    passthrough: true,
    run({ options, passthrough }) {
      expectTypeOf(passthrough).toEqualTypeOf<readonly string[]>()
      // @ts-expect-error 透传上下文只能读取
      passthrough.push('changed')
      expectTypeOf(options).toEqualTypeOf<LaunchInput>()
      expectTypeOf(options.buildTool).toEqualTypeOf<'auto' | 'maven' | 'gradle' | undefined>()
      expectTypeOf(options.build).toEqualTypeOf<'auto' | 'none' | undefined>()
      expectTypeOf(options.mainClass).toEqualTypeOf<string | undefined>()
      expectTypeOf(options.includeTests).toEqualTypeOf<boolean | undefined>()
      expectTypeOf(options.javaCommand).toEqualTypeOf<string | undefined>()
      expectTypeOf(options.buildCommand).toEqualTypeOf<string | undefined>()
      expectTypeOf(options.jvmArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.applicationArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.buildArgs).toEqualTypeOf<string[]>()

      // @ts-expect-error CLI 拼写不改变结果字段名
      expectTypeOf(options.tool)
      // @ts-expect-error CLI 拼写不改变结果字段名
      expectTypeOf(options.main)
      // @ts-expect-error CLI 拼写不改变结果字段名
      expectTypeOf(options['include-tests'])
      // @ts-expect-error CLI 拼写不改变结果字段名
      expectTypeOf(options.java)
      // @ts-expect-error CLI 拼写不改变结果字段名
      expectTypeOf(options['build-command'])
      // @ts-expect-error 重复选项仍以领域字段访问
      expectTypeOf(options['jvm-arg'])
      // @ts-expect-error 重复选项不能作为单值使用
      expectTypeOf<string>(options.applicationArgs)

      // @ts-expect-error force 只属于 init
      expectTypeOf(options.force)

      const resolved = resolveLaunchConfig(options, { includeTests: true }, { cwd: '/project' }, passthrough)
      expectTypeOf(resolved).toEqualTypeOf<LaunchConfig>()
      expectTypeOf(resolved.buildTool).toEqualTypeOf<'auto' | 'maven' | 'gradle'>()
      expectTypeOf(resolved.build).toEqualTypeOf<'auto' | 'none'>()
      expectTypeOf(resolved.includeTests).toEqualTypeOf<boolean>()
      expectTypeOf(resolved.jvmArgs).toEqualTypeOf<string[]>()
      expectTypeOf(resolved.applicationArgs).toEqualTypeOf<string[]>()
      expectTypeOf(resolved.buildArgs).toEqualTypeOf<string[]>()
      return resolved
    },
  })

  const planCommand = defineCommand({
    options: launchOptions,
    passthrough: true,
    run({ options, passthrough }) {
      expectTypeOf(passthrough).toEqualTypeOf<readonly string[]>()
      expectTypeOf(options).toEqualTypeOf<LaunchInput>()
      expectTypeOf(options.includeTests).toEqualTypeOf<boolean | undefined>()
      expectTypeOf(options.jvmArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.applicationArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.buildArgs).toEqualTypeOf<string[]>()
      // @ts-expect-error plan 不接受 init 的覆盖开关
      expectTypeOf(options.force)
      return options
    },
  })

  const initCommand = defineCommand({
    options: {
      ...launchOptions,
      force: option.boolean({ default: false }),
    },
    passthrough: true,
    run({ options, passthrough }) {
      expectTypeOf(passthrough).toEqualTypeOf<readonly string[]>()
      expectTypeOf(options.force).toEqualTypeOf<boolean>()
      expectTypeOf(options.includeTests).toEqualTypeOf<boolean | undefined>()
      expectTypeOf(options.jvmArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.applicationArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.buildArgs).toEqualTypeOf<string[]>()
      return options.force
    },
  })

  const services: JavaRunServices = {
    async readProjectConfig() {
      return { buildTool: 'maven', includeTests: true }
    },
    launch(request) {
      expectTypeOf(request).toEqualTypeOf<LaunchConfig>()
      // @ts-expect-error 启动请求不包含初始化开关
      expectTypeOf(request.force)
      return request
    },
    plan(request) {
      expectTypeOf(request).toEqualTypeOf<LaunchConfig>()
      // @ts-expect-error 计划请求不包含初始化开关
      expectTypeOf(request.force)
      return request
    },
    initialize(request) {
      expectTypeOf(request).toEqualTypeOf<InitRequest>()
      expectTypeOf(request.force).toEqualTypeOf<boolean>()
      expectTypeOf(request.includeTests).toEqualTypeOf<boolean>()
      return request
    },
  }

  const app = createJavaRunCommand(services, { cwd: '/project' })
  const commands = { run: runCommand, plan: planCommand, init: initCommand }
  const group = defineCommand({ commands, defaultCommand: 'run' })
  // @ts-expect-error 默认命令必须是已挂载的键
  defineCommand({ commands, defaultCommand: 'missing' })
  expectTypeOf(app).toEqualTypeOf<Command>()
  expectTypeOf(group).toEqualTypeOf<Command>()
  expectTypeOf(runCommand).toEqualTypeOf<Command>()
  expectTypeOf(planCommand).toEqualTypeOf<Command>()
  expectTypeOf(initCommand).toEqualTypeOf<Command>()
}
