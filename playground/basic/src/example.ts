import { defineCommand } from 'argvia'
import { runMain } from 'argvia/node'

// @env node
import { deploy } from './deploy.js'

const app = defineCommand({
  name: 'argvia-demo',
  description: 'Argvia 命令定义示例',
  commands: { deploy },
})

await runMain(app)
