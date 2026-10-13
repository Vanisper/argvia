import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  typescript: true,
}, {
  files: ['playground/basic/src/example.ts'],
  rules: { 'antfu/no-top-level-await': 'off' },
})
