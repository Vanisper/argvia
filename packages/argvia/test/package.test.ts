// @env node
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const packageDirectory = fileURLToPath(new URL('../', import.meta.url))
const fixtureDirectory = fileURLToPath(new URL('./fixtures/', import.meta.url))
const compiler = createRequire(import.meta.url).resolve('typescript/lib/tsc.js')
let consumerDirectory = ''

describe('构建产物的隔离消费', () => {
  beforeAll(() => {
    consumerDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'argvia-consumer-')))
    const installedPackage = join(consumerDirectory, 'node_modules', 'argvia')
    mkdirSync(installedPackage, { recursive: true })
    cpSync(join(packageDirectory, 'package.json'), join(installedPackage, 'package.json'))
    cpSync(join(packageDirectory, 'dist'), join(installedPackage, 'dist'), { recursive: true })
    writeFileSync(join(consumerDirectory, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
    for (const fixture of ['core.mjs', 'node.mjs', 'deny-builtins.mjs', 'consumer.ts']) {
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

  it('普通 Node 通过核心入口执行，完整依赖图不加载 Node 内建模块', () => {
    const child = spawnSync(process.execPath, ['core.mjs'], {
      cwd: consumerDirectory,
      encoding: 'utf8',
      timeout: 20_000,
    })

    expect(child.error).toBeUndefined()
    expect(child.stderr).toBe('')
    expect(child.status).toBe(0)
    expect(child.stdout).toBe('核心入口消费通过\n')
  })

  it('进程入口执行核心入口创建的命令，共享同一份命令定义', () => {
    const child = spawnSync(process.execPath, ['node.mjs', 'ready'], {
      cwd: consumerDirectory,
      encoding: 'utf8',
      timeout: 20_000,
    })

    expect(child.error).toBeUndefined()
    expect(child.stderr).toBe('')
    expect(child.status).toBe(0)
    expect(child.stdout).toBe('进程入口消费通过\n')
  })

  it.each([
    { module: 'NodeNext', moduleResolution: 'NodeNext' },
    { module: 'ESNext', moduleResolution: 'Bundler' },
  ])('$moduleResolution 消费者检查导出的类型声明及正负例', { timeout: 30_000 }, ({ module, moduleResolution }) => {
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
    const declarations = output.split(/\r?\n/u).filter(file => file.includes('/node_modules/argvia/'))
    const declarationDirectory = join(consumerDirectory, 'node_modules', 'argvia', 'dist').replaceAll('\\', '/')
    expect(declarations).toContain(`${declarationDirectory}/index.d.ts`)
    expect(declarations).toContain(`${declarationDirectory}/node.d.ts`)
    expect(declarations).toContain(`${declarationDirectory}/types.d.ts`)
    expect(declarations.every(file => file.startsWith(`${declarationDirectory}/`) && file.endsWith('.d.ts'))).toBe(true)
    expect(output).not.toContain('/@types/node/')
  })
})
