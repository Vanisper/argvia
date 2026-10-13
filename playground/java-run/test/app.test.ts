import type { InitRequest, LaunchConfig, LaunchInput, ProjectConfig } from '../src/app.js'
import { run } from '@argvia/core'
import { describe, expect, it, vi } from 'vitest'
import { createJavaRunCommand, resolveLaunchConfig } from '../src/app.js'

function createApplication(project: ProjectConfig = {}) {
  const readProjectConfig = vi.fn(async (_cwd: string) => project)
  const launch = vi.fn((request: LaunchConfig) => request)
  const plan = vi.fn((request: LaunchConfig) => request)
  const initialize = vi.fn((request: InitRequest) => request)
  const services = { readProjectConfig, launch, plan, initialize }
  const command = createJavaRunCommand(services, { cwd: '/project' })
  return { command, services }
}

describe('java-run 配置组合', () => {
  it.each(['run', 'plan'])('省略 CLI 布尔选项保留配置文件中的 true：%s', async (action) => {
    const { command, services } = createApplication({
      buildTool: 'maven',
      build: 'none',
      module: 'server',
      mainClass: 'example.Server',
      includeTests: true,
    })
    const request = {
      cwd: '/project',
      buildTool: 'maven',
      build: 'none',
      module: 'server',
      mainClass: 'example.Server',
      includeTests: true,
      javaCommand: undefined,
      buildCommand: undefined,
      jvmArgs: [],
      applicationArgs: [],
      buildArgs: [],
    }

    expect(await run(command, { argv: [action] })).toEqual({ kind: 'executed', value: request })
    expect(services.readProjectConfig).toHaveBeenCalledExactlyOnceWith('/project')
    const selected = action === 'run' ? services.launch : services.plan
    const other = action === 'run' ? services.plan : services.launch
    expect(selected).toHaveBeenCalledExactlyOnceWith(request)
    expect(other).not.toHaveBeenCalled()
    expect(services.initialize).not.toHaveBeenCalled()
  })

  it.each(['run', 'plan'])('显式 CLI 标量覆盖配置并使用选定目录读取：%s', async (action) => {
    const project = Object.freeze({
      buildTool: 'maven' as const,
      build: 'auto' as const,
      module: 'old-module',
      mainClass: 'example.OldMain',
      includeTests: false,
    })
    const { command, services } = createApplication(project)
    const request = {
      cwd: '/other-project',
      buildTool: 'gradle',
      build: 'none',
      module: 'new-module',
      mainClass: 'example.NewMain',
      includeTests: true,
      javaCommand: '/tools/java',
      buildCommand: '/tools/gradle',
      jvmArgs: [],
      applicationArgs: [],
      buildArgs: [],
    }
    const argv = [
      action,
      '--cwd=/other-project',
      '--tool=gradle',
      '--build=none',
      '--module=new-module',
      '--main',
      'example.NewMain',
      '--include-tests',
      '--java=/tools/java',
      '--build-command=/tools/gradle',
    ]

    expect(await run(command, { argv })).toEqual({ kind: 'executed', value: request })
    expect(services.readProjectConfig).toHaveBeenCalledExactlyOnceWith('/other-project')
    expect(action === 'run' ? services.launch : services.plan).toHaveBeenCalledExactlyOnceWith(request)
    expect(project).toEqual({
      buildTool: 'maven',
      build: 'auto',
      module: 'old-module',
      mainClass: 'example.OldMain',
      includeTests: false,
    })
  })

  it.each([
    { project: {}, description: '空配置' },
    { project: { includeTests: false }, description: '配置中的 false' },
  ])('合并后设置应用默认值：$description', async ({ project }) => {
    const { command, services } = createApplication(project)

    expect(await run(command, { argv: ['run'] })).toEqual({
      kind: 'executed',
      value: {
        cwd: '/project',
        buildTool: 'auto',
        build: 'auto',
        module: undefined,
        mainClass: undefined,
        includeTests: false,
        javaCommand: undefined,
        buildCommand: undefined,
        jvmArgs: [],
        applicationArgs: [],
        buildArgs: [],
      },
    })
    expect(services.launch).toHaveBeenCalledOnce()
  })

  it('显式请求 auto 时覆盖保存的构建工具与策略', async () => {
    const { command } = createApplication({ buildTool: 'maven', build: 'none' })

    expect(await run(command, { argv: ['run', '--tool=auto', '--build=auto'] })).toMatchObject({
      kind: 'executed',
      value: { buildTool: 'auto', build: 'auto' },
    })
  })

  it.each([
    { argv: ['init'], force: false, includeTests: false },
    { argv: ['init', '--force'], force: true, includeTests: false },
    { argv: ['init', '--include-tests'], force: false, includeTests: true },
  ])('init 跳过旧配置，局部 force 得到显式默认值：$argv', async ({ argv, force, includeTests }) => {
    const { command, services } = createApplication({
      buildTool: 'gradle',
      mainClass: 'example.OldMain',
      includeTests: true,
    })
    services.readProjectConfig.mockRejectedValue(new Error('旧配置无效'))
    const request = {
      cwd: '/project',
      buildTool: 'auto',
      build: 'auto',
      module: undefined,
      mainClass: undefined,
      includeTests,
      javaCommand: undefined,
      buildCommand: undefined,
      jvmArgs: [],
      applicationArgs: [],
      buildArgs: [],
      force,
    }

    expect(await run(command, { argv })).toEqual({ kind: 'executed', value: request })
    expect(services.initialize).toHaveBeenCalledExactlyOnceWith(request)
    expect(services.readProjectConfig).not.toHaveBeenCalled()
    expect(services.launch).not.toHaveBeenCalled()
    expect(services.plan).not.toHaveBeenCalled()
  })

  it.each(['run', 'plan', 'init'])('帮助不读配置、不执行业务，force 仅出现在 init：%s', async (action) => {
    const { command, services } = createApplication()
    services.readProjectConfig.mockRejectedValue(new Error('旧配置无效'))
    const result = await run(command, { argv: [action, '--help'] })

    expect(result.kind).toBe('help')
    if (result.kind === 'help') {
      expect(result.text).toContain(`java-run ${action}`)
      for (const flag of ['--tool', '--main', '--include-tests', '--java', '--build-command', '--jvm-arg', '--arg', '--build-arg'])
        expect(result.text).toContain(flag)
      for (const key of ['--buildTool', '--mainClass', '--includeTests', '--javaCommand', '--buildCommand'])
        expect(result.text).not.toContain(key)
      if (action === 'init')
        expect(result.text).toContain('--force')
      else
        expect(result.text).not.toContain('--force')
    }
    for (const service of Object.values(services))
      expect(service).not.toHaveBeenCalled()
  })

  it.each(['run', 'plan', 'init'])('交错重复选项按各自输入顺序组合，保留等号与空值：%s', async (action) => {
    const project = Object.freeze({
      jvmArgs: Object.freeze(['-Xms256m']),
      applicationArgs: Object.freeze(['configured']),
      buildArgs: Object.freeze(['--offline']),
    })
    const { command, services } = createApplication(project)
    if (action === 'init')
      services.readProjectConfig.mockRejectedValue(new Error('旧配置无效'))
    const argv = Object.freeze([
      action,
      '--jvm-arg=-Dname=a=b',
      '--arg=hello world',
      '--build-arg=-Pdev',
      '--jvm-arg=-Xmx1g',
      '--arg',
      '',
      '--build-arg=',
    ])
    const value = {
      jvmArgs: [...(action === 'init' ? [] : project.jvmArgs), '-Dname=a=b', '-Xmx1g'],
      applicationArgs: [...(action === 'init' ? [] : project.applicationArgs), 'hello world', ''],
      buildArgs: [...(action === 'init' ? [] : project.buildArgs), '-Pdev', ''],
    }

    expect(await run(command, { argv })).toMatchObject({ kind: 'executed', value })
    if (action === 'init') {
      expect(services.readProjectConfig).not.toHaveBeenCalled()
      expect(services.initialize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(value))
      expect(services.launch).not.toHaveBeenCalled()
      expect(services.plan).not.toHaveBeenCalled()
    }
    else {
      expect(services.readProjectConfig).toHaveBeenCalledExactlyOnceWith('/project')
      expect(action === 'run' ? services.launch : services.plan).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(value))
      expect(services.initialize).not.toHaveBeenCalled()
    }
    expect(project).toEqual({
      jvmArgs: ['-Xms256m'],
      applicationArgs: ['configured'],
      buildArgs: ['--offline'],
    })
  })

  it.each(['run', 'plan', 'init'])('透传值只追加到应用参数，保留 token 内容与边界：%s', async (action) => {
    const project = Object.freeze({
      jvmArgs: Object.freeze(['-Xms256m']),
      applicationArgs: Object.freeze(['configured']),
      buildArgs: Object.freeze(['--offline']),
    })
    const { command, services } = createApplication(project)
    if (action === 'init')
      services.readProjectConfig.mockRejectedValue(new Error('旧配置无效'))
    const tail = Object.freeze(['--help', '', ' ', '--', 'a=b', '--force', '--arg=literal'])
    const argv = Object.freeze([
      action,
      '--jvm-arg=-Xmx1g',
      '--arg=cli',
      '--build-arg=--info',
      '--',
      ...tail,
    ])
    const originalArgv = [...argv]
    const value = {
      jvmArgs: [...(action === 'init' ? [] : project.jvmArgs), '-Xmx1g'],
      applicationArgs: [...(action === 'init' ? [] : project.applicationArgs), 'cli', ...tail],
      buildArgs: [...(action === 'init' ? [] : project.buildArgs), '--info'],
    }

    expect(await run(command, { argv })).toMatchObject({ kind: 'executed', value })
    if (action === 'init') {
      expect(services.initialize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ...value, force: false }))
      expect(services.readProjectConfig).not.toHaveBeenCalled()
      expect(services.launch).not.toHaveBeenCalled()
      expect(services.plan).not.toHaveBeenCalled()
    }
    else {
      expect(services.readProjectConfig).toHaveBeenCalledExactlyOnceWith('/project')
      expect(action === 'run' ? services.launch : services.plan).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(value))
      expect(services.initialize).not.toHaveBeenCalled()
    }
    expect(argv).toEqual(originalArgv)
    expect(project).toEqual({
      jvmArgs: ['-Xms256m'],
      applicationArgs: ['configured'],
      buildArgs: ['--offline'],
    })
  })

  it.each(['run', 'plan', 'init'])('分隔符前的帮助跳过配置与业务执行：%s', async (action) => {
    const { command, services } = createApplication()
    services.readProjectConfig.mockRejectedValue(new Error('旧配置无效'))

    expect(await run(command, { argv: [action, '--help', '--', '--force', ''] })).toMatchObject({ kind: 'help' })
    for (const service of Object.values(services))
      expect(service).not.toHaveBeenCalled()
  })

  it.each(['run', 'plan', 'init'])('透传不能覆盖分隔符前的未知选项或缺失值：%s', async (action) => {
    const { command, services } = createApplication()
    for (const { tokens, code } of [
      { tokens: ['--unknown', '--', '--help'], code: 'unknown-option' },
      { tokens: ['--arg', '--', 'value'], code: 'missing-value' },
      { tokens: ['--main', '--', '--help'], code: 'missing-value' },
    ]) {
      expect(await run(command, { argv: [action, ...tokens] })).toMatchObject({
        kind: 'invalid-input',
        diagnostic: { code, commandPath: ['java-run', action] },
      })
    }
    for (const service of Object.values(services))
      expect(service).not.toHaveBeenCalled()
  })

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

  it.each([
    { argv: ['run', '--force'], code: 'unknown-option', flag: '--force' },
    { argv: ['plan', '--force'], code: 'unknown-option', flag: '--force' },
    { argv: ['run', '--tool=unknown'], code: 'invalid-value', flag: '--tool' },
    { argv: ['plan', '--build'], code: 'missing-value', flag: '--build' },
    { argv: ['init', '--force', '--force'], code: 'duplicate-option', flag: '--force' },
    { argv: ['init', '--main'], code: 'missing-value', flag: '--main' },
    { argv: ['run', '--java=java', '--java=other'], code: 'duplicate-option', flag: '--java' },
  ])('输入错误使用 CLI 拼写，发生在配置读取和业务执行前：$argv', async ({ argv, code, flag }) => {
    const { command, services } = createApplication()

    expect(await run(command, { argv })).toMatchObject({
      kind: 'invalid-input',
      diagnostic: { code, commandPath: ['java-run', argv[0]], message: expect.stringContaining(flag) },
    })
    for (const service of Object.values(services))
      expect(service).not.toHaveBeenCalled()
  })

  it.each(['run', 'plan', 'init'])('对象字段拼写不作为 CLI 别名：%s', async (action) => {
    const { command, services } = createApplication()
    for (const input of [
      '--buildTool=maven',
      '--mainClass=example.Main',
      '--includeTests',
      '--javaCommand=java',
      '--buildCommand=mvn',
    ]) {
      expect(await run(command, { argv: [action, input] })).toMatchObject({
        kind: 'invalid-input',
        diagnostic: { code: 'unknown-option', commandPath: ['java-run', action] },
      })
    }
    for (const service of Object.values(services))
      expect(service).not.toHaveBeenCalled()
  })

  it('配置读取失败原样传播，业务处理函数不会运行', async () => {
    const { command, services } = createApplication()
    const failure = new Error('配置无效')
    services.readProjectConfig.mockRejectedValue(failure)

    await expect(run(command, { argv: ['run'] })).rejects.toBe(failure)
    expect(services.launch).not.toHaveBeenCalled()
    expect(services.plan).not.toHaveBeenCalled()
    expect(services.initialize).not.toHaveBeenCalled()
  })

  it('根分组显示帮助，本阶段尚未提供默认命令', async () => {
    const { command, services } = createApplication()

    expect(await run(command, { argv: [] })).toMatchObject({ kind: 'help' })
    for (const service of Object.values(services))
      expect(service).not.toHaveBeenCalled()
  })
})
