// @env node
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const packageDirectory = fileURLToPath(new URL('../', import.meta.url))
const fixtureDirectory = fileURLToPath(new URL('./fixtures/', import.meta.url))
const coreDirectory = dirname(dirname(fileURLToPath(import.meta.resolve('@argvia/core'))))
const compiler = createRequire(import.meta.url).resolve('typescript/lib/tsc.js')
let consumerDirectory = ''

describe('进程适配包与核心包产物的隔离消费', () => {
  beforeAll(() => {
    consumerDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'argvia-node-consumer-')))
    for (const [name, source] of [['core', coreDirectory], ['node', packageDirectory]] as const) {
      const installedPackage = join(consumerDirectory, 'node_modules', '@argvia', name)
      mkdirSync(installedPackage, { recursive: true })
      cpSync(join(source, 'package.json'), join(installedPackage, 'package.json'))
      cpSync(join(source, 'dist'), join(installedPackage, 'dist'), { recursive: true })
    }
    writeFileSync(join(consumerDirectory, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
    for (const fixture of ['node.mjs', 'terminal.mjs', 'composition.mjs', 'consumer.ts']) {
      writeFileSync(
        join(consumerDirectory, fixture),
        readFileSync(join(fixtureDirectory, `${fixture}.txt`), 'utf8'),
      )
    }
  })

  afterAll(() => {
    if (consumerDirectory)
      rmSync(consumerDirectory, { recursive: true, force: true })
  })

  it('普通 Node 在两个包之间复用同一个命令定义', () => {
    const child = spawnSync(process.execPath, ['node.mjs', 'ready'], {
      cwd: consumerDirectory,
      encoding: 'utf8',
      timeout: 20_000,
    })

    expect(child.error).toBeUndefined()
    expect(child.stderr).toBe('')
    expect(child.status).toBe(0)
    expect(child.stdout).toBe('跨包消费通过\n')
  })

  it.each([
    { prefix: [], action: 'run' },
    { prefix: ['run'], action: 'run' },
    { prefix: ['plan'], action: 'plan' },
    { prefix: ['init', '--force'], action: 'init' },
  ])('两个包的产物组合解析命令 $prefix', ({ prefix, action }) => {
    const tail = ['--help', '', ' a ', '--', 'x=y']
    const child = spawnSync(process.execPath, [
      'composition.mjs',
      ...prefix,
      '--main=example.App',
      '--item=one',
      '--item=two',
      '--',
      ...tail,
    ], {
      cwd: consumerDirectory,
      encoding: 'utf8',
      timeout: 20_000,
    })

    expect(child.error).toBeUndefined()
    expect(child.status).toBe(0)
    expect(child.stderr).toBe('')
    expect(JSON.parse(child.stdout)).toEqual({
      action,
      args: {},
      options: { mainClass: 'example.App', items: ['one', 'two'], ...(action === 'init' ? { force: true } : {}) },
      passthrough: tail,
    })
  })

  it.each([
    { argv: ['success'], status: 0, stdout: '', stderr: '' },
    { argv: ['returned-error'], status: 0, stdout: '', stderr: '' },
    { argv: ['named-error'], status: 1, stdout: '', stderr: '意外故障' },
    { argv: ['invalid-error-code'], status: 1, stdout: '', stderr: '预期失败退出码必须是 1..255 的整数' },
    { argv: ['exit'], status: 7, stdout: '', stderr: '' },
    { argv: ['exit-zero'], status: 0, stdout: '', stderr: '' },
    { argv: ['exit-two'], status: 2, stdout: '', stderr: '' },
    { argv: ['cancel'], status: 130, stdout: '', stderr: '' },
    { argv: ['terminate'], status: 143, stdout: '', stderr: '' },
    { argv: ['exit-max'], status: 255, stdout: '', stderr: '' },
    { argv: ['ordinary'], status: 0, stdout: '', stderr: '' },
    { argv: ['copied'], status: 0, stdout: '', stderr: '' },
    { argv: ['invalid-exit'], status: 1, stdout: '', stderr: '退出码必须是 0..255 的整数' },
    { argv: [], status: 2, stdout: '', stderr: 'action' },
    { argv: ['throw'], status: 1, stdout: '', stderr: '业务失败' },
    { argv: ['reject'], status: 1, stdout: '', stderr: '异步业务失败' },
    { argv: ['--help'], status: 0, stdout: 'fixture', stderr: '' },
  ])('普通 Node 输入 $argv 返回退出码 $status', ({ argv, status, stdout, stderr }) => {
    const child = spawnSync(process.execPath, ['terminal.mjs', ...argv], {
      cwd: consumerDirectory,
      encoding: 'utf8',
      timeout: 20_000,
    })

    expect(child.error).toBeUndefined()
    expect(child.status).toBe(status)
    if (stdout)
      expect(child.stdout).toContain(stdout)
    else
      expect(child.stdout).toBe('')
    if (stderr)
      expect(child.stderr).toContain(stderr)
    else
      expect(child.stderr).toBe('')
  })

  it.each([
    { action: 'expected', status: 1, stderr: 'fixture: 配置无效\n' },
    { action: 'expected-two', status: 2, stderr: 'fixture: 主类无效\n' },
    { action: 'expected-async', status: 17, stderr: 'fixture: 工具不可用\n' },
  ])('预期业务失败只输出路径与消息：$action', ({ action, status, stderr }) => {
    const child = spawnSync(process.execPath, ['terminal.mjs', action], {
      cwd: consumerDirectory,
      encoding: 'utf8',
      timeout: 20_000,
    })

    expect(child.error).toBeUndefined()
    expect(child.status).toBe(status)
    expect(child.stdout).toBe('')
    expect(child.stderr).toBe(stderr)
  })

  it.each([
    { module: 'NodeNext', moduleResolution: 'NodeNext' },
    { module: 'ESNext', moduleResolution: 'Bundler' },
  ])('$moduleResolution 消费者从两个包的声明检查共享命令类型', { timeout: 30_000 }, ({ module, moduleResolution }) => {
    const config = join(consumerDirectory, `tsconfig.${moduleResolution}.json`)
    writeFileSync(config, JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module,
        moduleResolution,
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        noEmit: true,
        types: [],
        skipLibCheck: false,
      },
      files: ['consumer.ts'],
    }))
    const child = spawnSync(process.execPath, [compiler, '--project', config, '--listFiles'], {
      cwd: consumerDirectory,
      encoding: 'utf8',
      timeout: 20_000,
    })

    expect(child.error).toBeUndefined()
    expect(child.stderr).toBe('')
    expect(child.status, child.stdout).toBe(0)
    const output = child.stdout.replaceAll('\\', '/')
    const declarations = output.split(/\r?\n/u).filter(file => file.includes('/node_modules/@argvia/'))
    const installedDirectory = join(consumerDirectory, 'node_modules', '@argvia').replaceAll('\\', '/')
    expect(declarations).toContain(`${installedDirectory}/core/dist/index.d.ts`)
    expect(declarations).toContain(`${installedDirectory}/core/dist/types.d.ts`)
    expect(declarations).toContain(`${installedDirectory}/node/dist/index.d.ts`)
    expect(declarations.every(file => file.endsWith('.d.ts') && (
      file.startsWith(`${installedDirectory}/core/dist/`)
      || file.startsWith(`${installedDirectory}/node/dist/`)
    ))).toBe(true)
    expect(output).not.toContain('/@types/node/')
  })
})
