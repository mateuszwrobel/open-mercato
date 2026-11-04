/** @type {import('jest').Config} */
// Computed path keeps the root base config out of the architecture graph
// (repo-root is not a dependency target; see architecture.spec.toml).
const base = require(require('node:path').join(__dirname, '..', '..', 'jest.config.base.cjs'))

module.exports = {
  ...base,
  testEnvironment: 'node',
  watchman: false,
  rootDir: '.',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '<rootDir>/../../scripts/jest-mikroorm-transformer.cjs',
      {
        tsconfig: {
          jsx: 'react-jsx',
          rootDir: '.',
          ignoreDeprecations: '6.0',
        },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(sanitize-html|htmlparser2|domhandler|domutils|dom-serializer|domelementtype|entities|@mikro-orm|kysely)/)',
  ],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.(ts|tsx)'],
  passWithNoTests: true,
}
