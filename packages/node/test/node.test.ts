// @env node
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const packageDirectory = fileURLToPath(new URL('../', import.meta.url))
const fixtureDirectory = fileURLToPath(new URL('./fixtures/', import.meta.url))
const coreDirectory = dirname(dirname(fileURLToPath(import.meta.resolve('@argvia/core'))))
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
    for (const fixture of ['node.mjs', 'terminal.mjs']) {
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
    { argv: ['success'], status: 0, stdout: '', stderr: '' },
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
})
