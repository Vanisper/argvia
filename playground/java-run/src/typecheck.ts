import type { Command } from '@argvia/core'
import type { InitRequest, JavaRunServices, LaunchConfig, LaunchInput } from './app.js'
import { defineCommand } from '@argvia/core'
import { expectTypeOf } from 'vitest'
import { createJavaRunCommand, initOptions, launchOptions, resolveLaunchConfig } from './app.js'

/** 检查标量共享定义和配置组合的类型，负例只参与编译检查 */
export function verifyJavaRunTypes(): void {
  const runCommand = defineCommand({
    options: launchOptions,
    run({ options }) {
      expectTypeOf(options).toEqualTypeOf<LaunchInput>()
      expectTypeOf(options.buildTool).toEqualTypeOf<'auto' | 'maven' | 'gradle' | undefined>()
      expectTypeOf(options.build).toEqualTypeOf<'auto' | 'none' | undefined>()
      expectTypeOf(options.mainClass).toEqualTypeOf<string | undefined>()
      expectTypeOf(options.includeTests).toEqualTypeOf<boolean | undefined>()

      // @ts-expect-error force 只属于 init
      expectTypeOf(options.force)

      const resolved = resolveLaunchConfig(options, { includeTests: true }, { cwd: '/project' })
      expectTypeOf(resolved).toEqualTypeOf<LaunchConfig>()
      expectTypeOf(resolved.buildTool).toEqualTypeOf<'auto' | 'maven' | 'gradle'>()
      expectTypeOf(resolved.build).toEqualTypeOf<'auto' | 'none'>()
      expectTypeOf(resolved.includeTests).toEqualTypeOf<boolean>()
      return resolved
    },
  })

  const planCommand = defineCommand({
    options: launchOptions,
    run({ options }) {
      expectTypeOf(options).toEqualTypeOf<LaunchInput>()
      expectTypeOf(options.includeTests).toEqualTypeOf<boolean | undefined>()
      // @ts-expect-error plan 不接受 init 的覆盖开关
      expectTypeOf(options.force)
      return options
    },
  })

  const initCommand = defineCommand({
    options: initOptions,
    run({ options }) {
      expectTypeOf(options.force).toEqualTypeOf<boolean>()
      expectTypeOf(options.includeTests).toEqualTypeOf<boolean | undefined>()
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
  expectTypeOf(app).toEqualTypeOf<Command>()
  expectTypeOf(runCommand).toEqualTypeOf<Command>()
  expectTypeOf(planCommand).toEqualTypeOf<Command>()
  expectTypeOf(initCommand).toEqualTypeOf<Command>()
}
