import type { LaunchInput } from '../src/options.js'
import { describe, expect, it } from 'vitest'
import { resolveLaunchConfig } from '../src/config.js'

function createInput(overrides: Partial<LaunchInput> = {}): LaunchInput {
  return {
    cwd: undefined,
    buildTool: undefined,
    build: undefined,
    module: undefined,
    mainClass: undefined,
    includeTests: undefined,
    javaCommand: undefined,
    buildCommand: undefined,
    jvmArgs: [],
    applicationArgs: [],
    buildArgs: [],
    ...overrides,
  }
}

describe('启动配置组合', () => {
  it('配置组合返回独立数组，修改结果不影响 CLI、透传值、项目配置或后续调用', () => {
    const cli = createInput({
      jvmArgs: ['-Xmx1g'],
      applicationArgs: ['cli'],
      buildArgs: ['--info'],
    })
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

  it.each(['App', 'com.example.Outer$Inner', '示例.应用'])('主类支持完整名称、内部类和 Unicode 标识符：%s', (mainClass) => {
    const request = resolveLaunchConfig(createInput({ mainClass }), {}, { cwd: '/project' })

    expect(request.mainClass).toBe(mainClass)
  })

  it.each(['1App', 'com..App', 'com.App;exit', 'com.App-name', 'com/App', 'Invalid³', 'example.Main\n', 'example.Main\r\n'])('拒绝无效主类与尾部换行：%j', (mainClass) => {
    expect(() => resolveLaunchConfig(createInput({ mainClass }), {}, { cwd: '/project' })).toThrow('mainClass 必须是有效的 Java 类全名；请通过 --main 或项目配置 mainClass 修正')
  })

  it.each(['app', ':app', ':apps:admin-server', ':', 'apps/my app'])('单模块选择器只移除首尾空白：%s', (module) => {
    const request = resolveLaunchConfig(createInput({ module: ` ${module} ` }), {}, { cwd: '/project' })

    expect(request.module).toBe(module)
  })

  it.each(['app,lib', '!app', '-app', '?app'])('拒绝多选、排除与可选模块选择器：%s', (module) => {
    expect(() => resolveLaunchConfig(createInput({ module }), {}, { cwd: '/project' })).toThrow('module 必须指定单个模块，不能多选、排除或使用可选选择器；请通过 --module 或项目配置 module 修正')
  })

  it.each([
    { input: { cwd: '' }, field: 'cwd', correction: '请通过 --cwd 指定项目目录' },
    { input: { cwd: ' \t ' }, field: 'cwd', correction: '请通过 --cwd 指定项目目录' },
    { input: { module: '' }, field: 'module', correction: '请通过 --module 或项目配置 module 指定单个模块' },
    { input: { mainClass: ' ' }, field: 'mainClass', correction: '请通过 --main 或项目配置 mainClass 指定合法的 Java 类全名' },
    { input: { javaCommand: '' }, field: 'javaCommand', correction: '请通过 --java 指定工具路径' },
    { input: { buildCommand: ' ' }, field: 'buildCommand', correction: '请通过 --build-command 指定工具路径' },
    { input: { jvmArgs: [''] }, field: '合并后的 jvmArgs[0]', correction: '请检查 --jvm-arg 或项目配置 jvmArgs' },
    { input: { buildArgs: [' \t '] }, field: '合并后的 buildArgs[0]', correction: '请检查 --build-arg 或项目配置 buildArgs' },
  ])('目录、工具和 JVM/build 参数拒绝空白值并提示修正入口：$field', ({ input, field, correction }) => {
    expect(() => resolveLaunchConfig(createInput(input), {}, { cwd: '/project' })).toThrow(`${field} 必须是非空字符串；${correction}`)
  })

  it('合法路径和原始应用参数保留空白与边界', () => {
    const request = resolveLaunchConfig(createInput({
      cwd: '/project with spaces ',
      javaCommand: '/tools/java home ',
      buildCommand: '/tools/build tool ',
      jvmArgs: ['-Dmessage=hello world '],
      buildArgs: ['-Pname=hello world '],
      applicationArgs: ['', ' '],
    }), { applicationArgs: ['configured', ''] }, { cwd: '/project' }, ['--', '', '\t'])

    expect(request).toMatchObject({
      cwd: '/project with spaces ',
      javaCommand: '/tools/java home ',
      buildCommand: '/tools/build tool ',
      jvmArgs: ['-Dmessage=hello world '],
      buildArgs: ['-Pname=hello world '],
      applicationArgs: ['configured', '', '', ' ', '--', '', '\t'],
    })
  })
})
