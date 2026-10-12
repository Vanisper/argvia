import { option } from './index'

export const sharedOptions = {
  port: option.number({ default: 3000, description: '监听端口' }),
  mode: option.enum(['dev', 'prod'], { default: 'dev', description: '运行模式' }),
  token: option.string({ description: '访问令牌' }),
  verbose: option.boolean({ description: '显示详细信息' }),
}
