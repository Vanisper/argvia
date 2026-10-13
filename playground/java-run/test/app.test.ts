import type { InitRequest, LaunchConfig, ProjectConfig } from '../src/config.js'
import { run } from '@argvia/core'
import { describe, expect, it, vi } from 'vitest'
import { createJavaRunCommand } from '../src/app.js'

function createApplication(project: ProjectConfig = {}, environment = { cwd: '/project' }) {
  const readProjectConfig = vi.fn(async (_cwd: string) => project)
  const launch = vi.fn((_request: LaunchConfig): number | Promise<number> => 0)
  const plan = vi.fn((request: LaunchConfig) => request)
  const initialize = vi.fn((request: InitRequest) => request)
  const services = { readProjectConfig, launch, plan, initialize }
  const command = createJavaRunCommand(services, environment)
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

    expect(await run(command, { argv: [action] })).toEqual(action === 'run'
      ? { kind: 'exit', exitCode: 0, commandPath: ['java-run', 'run'] }
      : { kind: 'executed', value: request })
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

    expect(await run(command, { argv })).toEqual(action === 'run'
      ? { kind: 'exit', exitCode: 0, commandPath: ['java-run', 'run'] }
      : { kind: 'executed', value: request })
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

  it.each(['run', 'plan'])('显式 false 覆盖项目配置中的 true：%s', async (action) => {
    const { command, services } = createApplication({ includeTests: true })
    const result = await run(command, { argv: [action, '--include-tests=false'] })

    expect(result).toMatchObject(action === 'run'
      ? { kind: 'exit', exitCode: 0, commandPath: ['java-run', 'run'] }
      : { kind: 'executed', value: { includeTests: false } })
    expect(services.readProjectConfig).toHaveBeenCalledExactlyOnceWith('/project')
    expect(action === 'run' ? services.launch : services.plan).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ includeTests: false }))
  })

  it.each([
    { project: {}, description: '空配置' },
    { project: { includeTests: false }, description: '配置中的 false' },
  ])('合并后设置应用默认值：$description', async ({ project }) => {
    const { command, services } = createApplication(project)

    expect(await run(command, { argv: ['run'] })).toEqual({
      kind: 'exit',
      exitCode: 0,
      commandPath: ['java-run', 'run'],
    })
    expect(services.launch).toHaveBeenCalledExactlyOnceWith({
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
    })
  })

  it('显式请求 auto 时覆盖保存的构建工具与策略', async () => {
    const { command, services } = createApplication({ buildTool: 'maven', build: 'none' })

    expect(await run(command, { argv: ['run', '--tool=auto', '--build=auto'] })).toMatchObject({
      kind: 'exit',
      exitCode: 0,
      commandPath: ['java-run', 'run'],
    })
    expect(services.launch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ buildTool: 'auto', build: 'auto' }))
  })

  it.each([
    { argv: ['init'], force: false, includeTests: false },
    { argv: ['init', '--force'], force: true, includeTests: false },
    { argv: ['init', '--include-tests'], force: false, includeTests: true },
    { argv: ['init', '--force=false', '--include-tests=false'], force: false, includeTests: false },
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
      for (const label of ['--cwd <目录>', '--main <类全名>', '--tool <工具>', '--build <策略>', '--jvm-arg <参数>', '--java <路径>'])
        expect(result.text).toContain(label)
      for (const flag of ['--tool', '--main', '--include-tests', '--java', '--build-command', '--jvm-arg', '--arg', '--build-arg'])
        expect(result.text).toContain(flag)
      for (const key of ['--buildTool', '--mainClass', '--includeTests', '--javaCommand', '--buildCommand'])
        expect(result.text).not.toContain(key)
      expect(result.text).toContain('--include-tests=false')
      expect(result.text).toContain('取值仅支持等号形式')
      expect(result.text).toContain('每次传入一个非空白 JVM 参数；可重复')
      expect(result.text).toContain('每次传入一个应用参数，保留空串与空白；可重复')
      expect(result.text).toContain('应用参数最后追加 -- 透传值')
      if (action === 'init') {
        expect(result.text).toContain('--force')
        expect(result.text).toContain('仅使用本次输入与应用默认值，不读取旧配置')
        expect(result.text).not.toContain('配置 → CLI')
        expect(result.text).not.toContain('继承项目配置')
      }
      else {
        expect(result.text).not.toContain('--force')
        expect(result.text).toContain('配置标量省略时继承项目配置')
        expect(result.text).toContain('数组按配置 → CLI 追加')
      }
    }
    for (const service of Object.values(services))
      expect(service).not.toHaveBeenCalled()
  })

  it.each(['run', 'plan', 'init'])('交错重复选项按各自输入顺序组合，保留等号与应用参数空值：%s', async (action) => {
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
      '--build-arg=-Dname=a=b',
    ])
    const value = {
      jvmArgs: [...(action === 'init' ? [] : project.jvmArgs), '-Dname=a=b', '-Xmx1g'],
      applicationArgs: [...(action === 'init' ? [] : project.applicationArgs), 'hello world', ''],
      buildArgs: [...(action === 'init' ? [] : project.buildArgs), '-Pdev', '-Dname=a=b'],
    }

    expect(await run(command, { argv })).toMatchObject(action === 'run'
      ? { kind: 'exit', exitCode: 0, commandPath: ['java-run', 'run'] }
      : { kind: 'executed', value })
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

    expect(await run(command, { argv })).toMatchObject(action === 'run'
      ? { kind: 'exit', exitCode: 0, commandPath: ['java-run', 'run'] }
      : { kind: 'executed', value })
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

    expect(await run(command, { argv: [action, '--main=invalid-name', '--help', '--', '--force', ''] })).toMatchObject({ kind: 'help' })
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

  it.each(['run', 'plan', 'init'])('主类领域错误返回预期失败，不执行业务：%s', async (action) => {
    const { command, services } = createApplication({ mainClass: 'example.Configured' })

    expect(await run(command, { argv: [action, '--main=invalid-name'] })).toEqual({
      kind: 'failed',
      exitCode: 2,
      commandPath: ['java-run', action],
      message: 'mainClass 必须是有效的 Java 类全名；请通过 --main 或项目配置 mainClass 修正',
    })
    if (action === 'init')
      expect(services.readProjectConfig).not.toHaveBeenCalled()
    else
      expect(services.readProjectConfig).toHaveBeenCalledExactlyOnceWith('/project')
    expect(services.launch).not.toHaveBeenCalled()
    expect(services.plan).not.toHaveBeenCalled()
    expect(services.initialize).not.toHaveBeenCalled()
  })

  it.each(['run', 'plan', 'init'])('目录来自 CLI 或环境且为空白时，配置读取和业务均不执行：%s', async (action) => {
    for (const { argv, environment } of [
      { argv: [action, '--cwd= \t '], environment: { cwd: '/project' } },
      { argv: [action], environment: { cwd: '' } },
    ]) {
      const { command, services } = createApplication({}, environment)

      expect(await run(command, { argv })).toEqual({
        kind: 'failed',
        exitCode: 2,
        commandPath: ['java-run', action],
        message: 'cwd 必须是非空字符串；请通过 --cwd 指定项目目录',
      })
      for (const service of Object.values(services))
        expect(service).not.toHaveBeenCalled()
    }
  })

  it.each([
    { project: { mainClass: 'invalid-name' }, field: 'mainClass', flag: '--main', argv: [] },
    { project: { module: 'app,lib' }, field: 'module', flag: '--module', argv: [] },
    { project: { jvmArgs: [' '] }, field: 'jvmArgs[0]', flag: '--jvm-arg', argv: ['--jvm-arg=-Dtoken=not-printed'] },
    { project: { buildArgs: [''] }, field: 'buildArgs[0]', flag: '--build-arg', argv: ['--build-arg=-Dtoken=not-printed'] },
    { project: { jvmArgs: ['-Xmx1g', '-Dtoken=not-printed'] }, field: 'jvmArgs[2]', flag: '--jvm-arg', argv: ['--jvm-arg= '] },
    { project: { buildArgs: ['--info', '-Dtoken=not-printed'] }, field: 'buildArgs[2]', flag: '--build-arg', argv: ['--build-arg= '] },
  ])('合并后的领域错误指明字段、零基下标和修正入口，不回显参数：$field', async ({ project, field, flag, argv }) => {
    const { command, services } = createApplication(project)
    const result = await run(command, { argv })

    expect(result).toMatchObject({
      kind: 'failed',
      exitCode: 2,
      commandPath: ['java-run', 'run'],
      message: expect.stringContaining(field),
    })
    if (result.kind === 'failed') {
      expect(result.message).toContain(flag)
      expect(result.message).toContain('项目配置')
      expect(result.message).not.toContain('not-printed')
      if (field.includes('['))
        expect(result.message).toContain(`合并后的 ${field}`)
    }
    expect(services.readProjectConfig).toHaveBeenCalledExactlyOnceWith('/project')
    expect(services.launch).not.toHaveBeenCalled()
    expect(services.plan).not.toHaveBeenCalled()
    expect(services.initialize).not.toHaveBeenCalled()
  })

  it('init 忽略旧配置中的无效字段和数组，只校验本次请求', async () => {
    const { command, services } = createApplication({ mainClass: 'invalid-name', module: 'app,lib', jvmArgs: [''], buildArgs: [' '] })
    const request = { mainClass: 'example.App', jvmArgs: ['-Xmx1g'], buildArgs: ['--info'], module: undefined }

    expect(await run(command, { argv: ['init', '--main=example.App', '--jvm-arg=-Xmx1g', '--build-arg=--info'] })).toMatchObject({
      kind: 'executed',
      value: request,
    })
    expect(services.initialize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(request))
    expect(services.readProjectConfig).not.toHaveBeenCalled()
    expect(services.launch).not.toHaveBeenCalled()
    expect(services.plan).not.toHaveBeenCalled()
  })

  it.each([
    { option: '--java= ', message: 'javaCommand 必须是非空字符串；请通过 --java 指定工具路径' },
    { option: '--build-command= ', message: 'buildCommand 必须是非空字符串；请通过 --build-command 指定工具路径' },
    { option: '--jvm-arg= ', message: '合并后的 jvmArgs[0] 必须是非空字符串；请检查 --jvm-arg 或项目配置 jvmArgs' },
    { option: '--build-arg= ', message: '合并后的 buildArgs[0] 必须是非空字符串；请检查 --build-arg 或项目配置 buildArgs' },
  ])('空白工具或启动参数属于预期领域失败：$option', async ({ option, message }) => {
    const { command, services } = createApplication()

    expect(await run(command, { argv: [option] })).toEqual({
      kind: 'failed',
      exitCode: 2,
      commandPath: ['java-run', 'run'],
      message,
    })
    expect(services.launch).not.toHaveBeenCalled()
    expect(services.plan).not.toHaveBeenCalled()
    expect(services.initialize).not.toHaveBeenCalled()
  })

  it.each(['run', 'plan'])('有效 CLI 覆盖无效配置标量，再校验并规范化最终模块：%s', async (action) => {
    const project = Object.freeze({ mainClass: 'invalid-name', module: 'app,lib' })
    const { command, services } = createApplication(project)
    const request = { mainClass: '示例.Outer$Inner', module: ':apps:service' }
    const result = await run(command, {
      argv: [action, '--main=示例.Outer$Inner', '--module= :apps:service '],
    })

    expect(result).toMatchObject(action === 'run'
      ? { kind: 'exit', exitCode: 0, commandPath: ['java-run', 'run'] }
      : { kind: 'executed', value: request })
    expect(action === 'run' ? services.launch : services.plan).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(request))
    expect(project).toEqual({ mainClass: 'invalid-name', module: 'app,lib' })
  })

  it.each([
    { argv: ['run'], launch: () => 7, description: '同步启动状态' },
    { argv: [], launch: async () => 7, description: '异步启动状态与默认入口' },
  ])('显式传递非零业务退出码：$description', async ({ argv, launch }) => {
    const { command, services } = createApplication()
    services.launch.mockImplementationOnce(launch)

    expect(await run(command, { argv })).toEqual({ kind: 'exit', exitCode: 7, commandPath: ['java-run', 'run'] })
    expect(services.launch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ cwd: '/project', includeTests: false }))
    expect(services.plan).not.toHaveBeenCalled()
    expect(services.initialize).not.toHaveBeenCalled()
  })

  it.each([
    { argv: [], overrides: {} },
    {
      argv: [
        '--tool=maven',
        '--jvm-arg=-Xmx1g',
        '--arg=cli',
        '--build-arg=--info',
        '--arg=next',
        '--',
        '--help',
        '',
        ' ',
        'a=b',
      ],
      overrides: {
        buildTool: 'maven',
        jvmArgs: ['-Xms256m', '-Xmx1g'],
        applicationArgs: ['configured', 'cli', 'next', '--help', '', ' ', 'a=b'],
        buildArgs: ['--offline', '--info'],
      },
    },
    { argv: ['--', '--help'], overrides: { applicationArgs: ['configured', '--help'] } },
  ])('省略 run 与显式 run 得到相同的配置和调用：$argv', async ({ argv, overrides }) => {
    const project = Object.freeze({
      buildTool: 'gradle' as const,
      mainClass: 'example.Main',
      includeTests: true,
      jvmArgs: Object.freeze(['-Xms256m']),
      applicationArgs: Object.freeze(['configured']),
      buildArgs: Object.freeze(['--offline']),
    })
    const request = {
      cwd: '/project',
      buildTool: 'gradle',
      build: 'auto',
      module: undefined,
      mainClass: 'example.Main',
      includeTests: true,
      javaCommand: undefined,
      buildCommand: undefined,
      jvmArgs: ['-Xms256m'],
      applicationArgs: ['configured'],
      buildArgs: ['--offline'],
      ...overrides,
    }

    for (const input of [argv, ['run', ...argv]]) {
      const { command, services } = createApplication(project)
      expect(await run(command, { argv: Object.freeze(input) })).toEqual({ kind: 'exit', exitCode: 0, commandPath: ['java-run', 'run'] })
      expect(services.readProjectConfig).toHaveBeenCalledExactlyOnceWith('/project')
      expect(services.launch).toHaveBeenCalledExactlyOnceWith(request)
      expect(services.plan).not.toHaveBeenCalled()
      expect(services.initialize).not.toHaveBeenCalled()
    }
  })

  it.each(['-h', '--help'])('根帮助标出默认命令，显式 run 帮助说明启动选项：%s', async (helpFlag) => {
    const { command, services } = createApplication()
    services.readProjectConfig.mockRejectedValue(new Error('旧配置无效'))

    const rootHelp = await run(command, { argv: [helpFlag] })
    expect(rootHelp.kind).toBe('help')
    if (rootHelp.kind === 'help') {
      expect(rootHelp.text).toContain('java-run')
      expect(rootHelp.text).toContain('run')
      expect(rootHelp.text).toContain('默认')
      expect(rootHelp.text).toContain('plan')
      expect(rootHelp.text).toContain('init')
      expect(rootHelp.text).not.toContain('--tool')
    }
    const runHelp = await run(command, { argv: ['run', helpFlag] })
    expect(runHelp.kind).toBe('help')
    if (runHelp.kind === 'help') {
      expect(runHelp.text).toContain('java-run run')
      expect(runHelp.text).toContain('--tool')
      expect(runHelp.text).not.toContain('子命令')
    }
    for (const service of Object.values(services))
      expect(service).not.toHaveBeenCalled()
  })

  it.each([
    { argv: ['plna'], code: 'unknown-command', commandPath: ['java-run'] },
    { argv: ['--force'], code: 'unknown-option', commandPath: ['java-run', 'run'] },
    { argv: ['--force', 'init'], code: 'unknown-option', commandPath: ['java-run', 'run'] },
    { argv: ['--cwd', 'project', 'plan'], code: 'extra-argument', commandPath: ['java-run', 'run'] },
  ])('默认命令按选定路径报告输入错误，不向后寻找命令词：$argv', async ({ argv, code, commandPath }) => {
    const { command, services } = createApplication()

    expect(await run(command, { argv })).toMatchObject({ kind: 'invalid-input', diagnostic: { code, commandPath } })
    for (const service of Object.values(services))
      expect(service).not.toHaveBeenCalled()
  })

  it('默认运行时选项值可以与子命令同名', async () => {
    const { command, services } = createApplication()

    expect(await run(command, { argv: ['--cwd', 'plan'] })).toMatchObject({
      kind: 'exit',
      exitCode: 0,
      commandPath: ['java-run', 'run'],
    })
    expect(services.readProjectConfig).toHaveBeenCalledExactlyOnceWith('plan')
    expect(services.launch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ cwd: 'plan' }))
    expect(services.plan).not.toHaveBeenCalled()
    expect(services.initialize).not.toHaveBeenCalled()
  })
})
