// @env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const fixture = fileURLToPath(new URL('./node-fixture.ts', import.meta.url))

describe('runMain 终端契约', () => {
  it.each([
    { argv: ['success'], status: 0, stdout: '', stderr: '' },
    { argv: [], status: 2, stdout: '', stderr: 'action' },
    { argv: ['throw'], status: 1, stdout: '', stderr: '业务失败' },
    { argv: ['reject'], status: 1, stdout: '', stderr: '异步业务失败' },
    { argv: ['--help'], status: 0, stdout: 'fixture', stderr: '' },
  ])('输入 $argv 返回退出码 $status', ({ argv, status, stdout, stderr }) => {
    const child = spawnSync(process.execPath, ['--import', 'tsx', fixture, ...argv], { encoding: 'utf8' })
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
