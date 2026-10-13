// @env node
import type { JavaRunServices } from './app.js'
import type { InitRequest, LaunchConfig, ProjectConfig } from './config.js'
import process from 'node:process'
import { runMain } from '@argvia/node'
import { createJavaRunCommand } from './app.js'

// 演示中所有目录共用内存配置，业务操作仅输出最终请求
const project: ProjectConfig = {
  buildTool: 'maven',
  mainClass: 'example.Main',
  includeTests: true,
  jvmArgs: ['-Xms256m'],
  applicationArgs: ['--profile=demo'],
  buildArgs: ['--offline'],
}

function printRequest(action: 'run' | 'plan' | 'init', request: LaunchConfig | InitRequest): void {
  process.stdout.write(`${JSON.stringify({ demo: true, action, request }, null, 2)}\n`)
}

const services: JavaRunServices = {
  readProjectConfig: async () => project,
  launch(request) {
    printRequest('run', request)
    return 0
  },
  plan: request => printRequest('plan', request),
  initialize: request => printRequest('init', request),
}

await runMain(createJavaRunCommand(services, { cwd: process.cwd() }))
