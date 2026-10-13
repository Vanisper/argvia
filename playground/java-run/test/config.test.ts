import type { LaunchInput } from '../src/options.js'
import { describe, expect, it } from 'vitest'
import { resolveLaunchConfig } from '../src/config.js'

describe('启动配置组合', () => {
  it('配置组合返回独立数组，修改结果不影响 CLI、透传值、项目配置或后续调用', () => {
    const cli: LaunchInput = {
      cwd: undefined,
      buildTool: undefined,
      build: undefined,
      module: undefined,
      mainClass: undefined,
      includeTests: undefined,
      javaCommand: undefined,
      buildCommand: undefined,
      jvmArgs: ['-Xmx1g'],
      applicationArgs: ['cli'],
      buildArgs: ['--info'],
    }
    const project = {
      jvmArgs: ['-Xms256m'],
      applicationArgs: ['configured'],
      buildArgs: ['--offline'],
    }
    for (const values of [cli.jvmArgs, cli.applicationArgs, cli.buildArgs, ...Object.values(project)])
      Object.freeze(values)
    const tail = Object.freeze(['tail', ''])
    const first = resolveLaunchConfig(cli, project, { cwd: '/project' }, tail)
    first.jvmArgs.push('changed')
    first.applicationArgs.push('changed')
    first.buildArgs.push('changed')
    const second = resolveLaunchConfig(cli, project, { cwd: '/project' }, tail)

    expect(second).toMatchObject({
      jvmArgs: ['-Xms256m', '-Xmx1g'],
      applicationArgs: ['configured', 'cli', 'tail', ''],
      buildArgs: ['--offline', '--info'],
    })
    expect(tail).toEqual(['tail', ''])
    expect(second.applicationArgs).not.toBe(tail)
    for (const key of ['jvmArgs', 'applicationArgs', 'buildArgs'] as const) {
      expect(first[key]).not.toBe(second[key])
      expect(second[key]).not.toBe(cli[key])
      expect(second[key]).not.toBe(project[key])
    }
  })
})
