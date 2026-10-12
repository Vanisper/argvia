import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  typescript: true,
  ignores: ['docs/prototypes/typing.ts'],
}, {
  files: ['experiments/command-api/example.ts', 'experiments/command-api/main-fixture.ts'],
  rules: { 'antfu/no-top-level-await': 'off' },
})
