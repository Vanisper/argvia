// @env node
import { deploy } from './deploy'
import { defineCommand, runMain } from './index'

const app = defineCommand({
  name: 'argvia-demo',
  description: 'Argvia 候选接口实验',
  commands: { deploy },
})

await runMain(app)
