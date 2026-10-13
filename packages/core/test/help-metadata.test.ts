import { argument, defineCommand, DefinitionError, option, run } from '@argvia/core'
import { describe, expect, it, vi } from 'vitest'

describe('帮助值标签', () => {
  it('选项与位置参数使用自定义标签，执行仍按字段名和类型取值', async () => {
    const handler = vi.fn(context => context)
    const command = defineCommand({
      name: 'tool',
      args: [argument.string('entry', { required: true, valueName: '文件' }), argument.string('note', { valueName: '说明' })],
      options: {
        mainClass: option.string({ flag: '--main', valueName: '类全名' }),
        count: option.number({ valueName: '次数', default: 3 }),
        mode: option.enum(['dev', 'prod'], { valueName: '模式' }),
        items: option.string({ multiple: true, valueName: '参数' }),
        enabled: option.boolean(),
      },
      run: handler,
    })

    const help = await run(command, { argv: ['--help'] })
    expect(help.kind).toBe('help')
    if (help.kind === 'help') {
      expect(help.text).toContain('用法：tool <文件> [说明] [选项]')
      expect(help.text).toContain('位置参数：\n  文件  必填\n  说明')
      expect(help.text).toContain('--main <类全名>')
      expect(help.text).toContain('--count <次数>  默认值：3')
      expect(help.text).toContain('--mode <模式>  候选值：dev | prod')
      expect(help.text).toContain('--items <参数>  可重复')
      expect(help.text).toContain('--enabled[=true|false]')
    }
    expect(handler).not.toHaveBeenCalled()

    expect(await run(command, { argv: ['app.jar', '--main=example.App', '--mode=dev', '--items=a', '--items=b', '--enabled=false'] })).toEqual({
      kind: 'executed',
      value: { args: { entry: 'app.jar', note: undefined }, options: { mainClass: 'example.App', count: 3, mode: 'dev', items: ['a', 'b'], enabled: false } },
    })
    expect(await run(command, { argv: [] })).toMatchObject({ kind: 'invalid-input', diagnostic: { message: '缺少必填位置参数「entry」' } })
  })

  it('省略标签沿用默认提示，修改构造配置不改变已有标签', async () => {
    const config = { valueName: 'file path' }
    const field = option.string(config)
    config.valueName = 'other'
    const command = defineCommand({
      args: [argument.string('entry')],
      options: { file: field, text: option.string(), count: option.number(), mode: option.enum(['dev']) },
      run() {},
    })
    const help = await run(command, { argv: ['--help'] })

    expect(Object.isFrozen(field)).toBe(true)
    if (help.kind === 'help') {
      expect(help.text).toContain('[entry]')
      expect(help.text).toContain('--file <file path>')
      expect(help.text).toContain('--text <字符串>')
      expect(help.text).toContain('--count <数值>')
      expect(help.text).toContain('--mode <值>')
    }
    else {
      throw new Error('预期帮助结果')
    }
  })

  it.each(['', ' ', ' name', 'name ', '<name>', 'a\nb', 'a\rb', 'a\u2028b', 'a\u2029b', undefined, null, 7])('构造时拒绝非法标签：%j', (valueName) => {
    expect(() => Reflect.apply(option.string, undefined, [{ valueName }])).toThrow(DefinitionError)
    expect(() => Reflect.apply(argument.string, undefined, ['entry', { valueName }])).toThrow(DefinitionError)
  })

  it('布尔开关拒绝标签，包括显式 undefined', () => {
    for (const valueName of ['布尔值', undefined])
      expect(() => Reflect.apply(option.boolean, undefined, [{ valueName }])).toThrow('布尔开关不支持 valueName')
  })
})
