// @env node
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cwd = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const entry = fileURLToPath(new URL('../src/main.ts', import.meta.url))

function invoke(argv: string[]) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', entry, ...argv], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  })
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  return result
}

describe('java-run 演示入口', () => {
  it('无参数时通过默认 run 展示内存配置和当前目录', () => {
    const result = invoke([])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({
      demo: true,
      action: 'run',
      request: {
        cwd,
        buildTool: 'maven',
        build: 'auto',
        mainClass: 'example.Main',
        includeTests: true,
        jvmArgs: ['-Xms256m'],
        applicationArgs: ['--profile=demo'],
        buildArgs: ['--offline'],
      },
    })
  })

  it.each(['run', 'plan', 'init'])('输出所选操作的请求并保留透传值：%s', (action) => {
    const tail = ['--help', '', ' ', '--', 'key=value']
    const result = invoke([
      ...(action === 'run' ? [] : [action]),
      ...(action === 'init' ? ['--force'] : []),
      '--cwd',
      'demo-project',
      '--tool',
      'gradle',
      '--main',
      'example.CliMain',
      '--jvm-arg=-Xmx1g',
      '--arg',
      'cli',
      '--build-arg=--quiet',
      '--',
      ...tail,
    ])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({
      demo: true,
      action,
      request: {
        cwd: 'demo-project',
        buildTool: 'gradle',
        build: 'auto',
        mainClass: 'example.CliMain',
        includeTests: action !== 'init',
        jvmArgs: [...(action === 'init' ? [] : ['-Xms256m']), '-Xmx1g'],
        applicationArgs: [...(action === 'init' ? [] : ['--profile=demo']), 'cli', ...tail],
        buildArgs: [...(action === 'init' ? [] : ['--offline']), '--quiet'],
        ...(action === 'init' ? { force: true } : {}),
      },
    })
  })

  it.each([
    { argv: ['--help'], usage: '用法：java-run [命令]', group: true },
    { argv: ['run', '--help'], usage: '用法：java-run run [选项]', group: false },
  ])('帮助显示对应作用域且不输出业务请求：$argv', ({ argv, usage, group }) => {
    const result = invoke(argv)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain(usage)
    expect(result.stdout).not.toContain('"demo"')
    expect(result.stdout).toContain('示例：')
    if (group) {
      expect(result.stdout).toContain('run（默认）')
      expect(result.stdout).not.toContain('--tool <')
      expect(result.stdout).toContain('java-run plan --tool=gradle -- --profile=dev')
    }
    else {
      expect(result.stdout).toContain('--tool')
      expect(result.stdout).not.toContain('子命令：')
    }
  })

  it('默认 run 拒绝 init 专属选项并以退出码 2 提示对应帮助', () => {
    const result = invoke(['--force'])

    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('--force')
    expect(result.stderr).toContain('java-run run --help')
  })

  it('显式 false 覆盖内存配置中的 true', () => {
    const result = invoke(['--include-tests=false'])

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({ demo: true, action: 'run', request: { includeTests: false } })
  })

  it('领域失败输出命令路径和消息，不追加解析帮助', () => {
    const result = invoke(['--main=invalid-name'])

    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('java-run run: mainClass 必须是有效的 Java 类全名；请通过 --main 或项目配置 mainClass 修正\n')
  })

  it('注入非零启动状态，通过真实 Node 进程保留退出码', () => {
    const appUrl = new URL('../src/app.ts', import.meta.url).href
    const source = `
      import { runMain } from '@argvia/node'
      import { createJavaRunCommand } from ${JSON.stringify(appUrl)}
      await runMain(createJavaRunCommand({
        readProjectConfig: async () => ({}),
        launch: async () => 7,
        plan: () => {},
        initialize: () => {},
      }, { cwd: process.cwd() }))
    `
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {
      cwd,
      encoding: 'utf8',
      timeout: 10_000,
    })

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(7)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
  })
})
