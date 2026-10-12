import type { InitRequest, LaunchConfig, ProjectConfig } from '../src/app.js'
import { run } from 'argvia'
import { describe, expect, it, vi } from 'vitest'
import { createJavaRunCommand } from '../src/app.js'

function createApplication(project: ProjectConfig = {}) {
  const readProjectConfig = vi.fn(async (_cwd: string) => project)
  const launch = vi.fn((request: LaunchConfig) => request)
  const plan = vi.fn((request: LaunchConfig) => request)
  const initialize = vi.fn((request: InitRequest) => request)
  const services = { readProjectConfig, launch, plan, initialize }
  const command = createJavaRunCommand(services, { cwd: '/project' })
  return { command, services }
}

describe('java-run 标量配置组合', () => {
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
    }
    const argv = [
      action,
      '--cwd=/other-project',
      '--buildTool=gradle',
      '--build=none',
      '--module=new-module',
      '--mainClass=example.NewMain',
      '--includeTests',
      '--javaCommand=/tools/java',
      '--buildCommand=/tools/gradle',
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
      },
    })
    expect(services.launch).toHaveBeenCalledOnce()
  })

  it('显式请求 auto 时覆盖保存的构建工具与策略', async () => {
    const { command } = createApplication({ buildTool: 'maven', build: 'none' })

    expect(await run(command, { argv: ['run', '--buildTool=auto', '--build=auto'] })).toMatchObject({
      kind: 'executed',
      value: { buildTool: 'auto', build: 'auto' },
    })
  })

  it.each([
    { argv: ['init'], force: false, includeTests: false },
    { argv: ['init', '--force'], force: true, includeTests: false },
    { argv: ['init', '--includeTests'], force: false, includeTests: true },
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
      expect(result.text).toContain('--includeTests')
      if (action === 'init')
        expect(result.text).toContain('--force')
      else
        expect(result.text).not.toContain('--force')
    }
    for (const service of Object.values(services))
      expect(service).not.toHaveBeenCalled()
  })

  it.each([
    { argv: ['run', '--force'], code: 'unknown-option' },
    { argv: ['plan', '--force'], code: 'unknown-option' },
    { argv: ['run', '--buildTool=unknown'], code: 'invalid-value' },
    { argv: ['plan', '--build'], code: 'missing-value' },
    { argv: ['init', '--force', '--force'], code: 'duplicate-option' },
  ])('输入错误发生在配置读取和业务执行前：$argv', async ({ argv, code }) => {
    const { command, services } = createApplication()

    expect(await run(command, { argv })).toMatchObject({
      kind: 'invalid-input',
      diagnostic: { code, commandPath: ['java-run', argv[0]] },
    })
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
