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

describe('命令帮助示例', () => {
  it('当前命令按声明顺序显示示例，默认与嵌套路由不继承父级示例', async () => {
    const handler = vi.fn()
    const leaf = defineCommand({
      examples: ['tool launch --item=first', 'tool launch --item=second -- --help'],
      passthrough: true,
      options: { item: option.string() },
      run: handler,
    })
    const root = defineCommand({ name: 'tool', examples: ['tool --help'], commands: { launch: leaf }, defaultCommand: 'launch' })

    const rootHelp = await run(root, { argv: ['--help'] })
    const leafHelp = await run(root, { argv: ['launch', '--help'] })
    const defaultHelp = await run(root, { argv: ['--item=first', '--help'] })
    expect(rootHelp.kind).toBe('help')
    expect(leafHelp.kind).toBe('help')
    if (rootHelp.kind === 'help' && leafHelp.kind === 'help') {
      expect(rootHelp.text.endsWith('示例：\n  tool --help')).toBe(true)
      expect(rootHelp.text).not.toContain('tool launch --item=first')
      expect(leafHelp.text.endsWith('示例：\n  tool launch --item=first\n  tool launch --item=second -- --help')).toBe(true)
      expect(leafHelp.text).not.toContain('  tool --help')
      expect(leafHelp.text.indexOf('示例：')).toBeGreaterThan(leafHelp.text.indexOf('透传：'))
    }
    expect(defaultHelp).toEqual(leafHelp)
    expect(handler).not.toHaveBeenCalled()
  })

  it('保存示例快照，不冻结调用方数组，重新挂载时保留文本原文', async () => {
    const examples = ['  original run --text=" a "  ']
    const leaf = defineCommand({ examples, run() {} })
    examples[0] = 'changed'
    examples.push('added')
    const wrapper = defineCommand({ name: 'other', commands: { inspect: leaf } })
    const help = await run(wrapper, { argv: ['inspect', '--help'] })

    expect(Object.isFrozen(examples)).toBe(false)
    expect(Object.isFrozen(leaf.examples)).toBe(true)
    expect(leaf.examples).toEqual(['  original run --text=" a "  '])
    if (help.kind === 'help') {
      expect(help.text).toContain('用法：other inspect')
      expect(help.text.endsWith('示例：\n    original run --text=" a "  ')).toBe(true)
      expect(help.text).not.toContain('changed')
    }
    else {
      throw new Error('预期帮助结果')
    }
  })

  it('省略或空数组都不显示示例段落', async () => {
    const commands = [defineCommand({ run() {} }), defineCommand({ examples: [], run() {} }), defineCommand({ examples: [], commands: {} })]
    for (const command of commands) {
      const result = await run(command, { argv: ['--help'] })
      expect(result.kind).toBe('help')
      if (result.kind === 'help')
        expect(result.text).not.toContain('示例：')
    }
  })

  it.each([undefined, null, 'tool', {}, [''], [' '], [7], ['a\nb'], ['a\rb'], ['a\u2028b'], ['a\u2029b'], Array.from({ length: 1 })])('拒绝非法示例配置：%j', (examples) => {
    for (const definition of [{ examples, run() {} }, { examples, commands: {} }])
      expect(() => Reflect.apply(defineCommand, undefined, [definition])).toThrow(DefinitionError)
  })

  it('拒绝含空位的稀疏示例数组', () => {
    const examples = ['tool --help']
    examples.length = 2
    expect(() => defineCommand({ examples, run() {} })).toThrow(DefinitionError)
  })
})
