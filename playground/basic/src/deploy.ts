// @env node
import process from 'node:process'
import { argument, defineCommand } from 'argvia'
import { sharedOptions } from './shared-options.js'

export const deploy = defineCommand({
  description: '展示解析结果，验证部署命令的调用体验',
  args: [
    argument.string('entry', { required: true, description: '入口文件' }),
    argument.string('label', { description: '部署标签' }),
  ],
  options: sharedOptions,
  run({ args, options }) {
    const resolved = { args, options }
    process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`)
    return resolved
  },
})
