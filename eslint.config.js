import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  typescript: true,
}, {
  files: ['playground/basic/src/example.ts', 'playground/java-run/src/main.ts'],
  rules: { 'antfu/no-top-level-await': 'off' },
})
