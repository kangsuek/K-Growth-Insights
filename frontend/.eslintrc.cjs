/* ESLint 설정. 플러그인은 이미 devDependencies에 있었으나 설정 파일이 없어
   `npm run lint`가 항상 실패했다(그래서 훅 규칙 위반이 잡히지 않았다). */
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'coverage', 'node_modules', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  rules: {
    // 사용하지 않는 변수는 오류. 단, 의도적으로 버리는 인자는 _ 접두사로 표시.
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // PropTypes는 공용 컴포넌트에만 선언하는 것이 이 저장소의 관행이라 강제하지 않는다.
    'react/prop-types': 'off',
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.test.jsx', 'src/test/**'],
      globals: {
        describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly',
        afterAll: 'readonly', vi: 'readonly', global: 'writable',
      },
    },
  ],
}
