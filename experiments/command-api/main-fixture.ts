// @env node
import { argument, defineCommand, runMain } from './index'

const app = defineCommand({
  name: 'fixture',
  args: [argument.string('action', { required: true })],
  run({ args }) {
    if (args.action === 'throw')
      throw new Error('业务失败')
    if (args.action === 'reject')
      return Promise.reject(new Error('异步业务失败'))
    return 42
  },
})

await runMain(app)
