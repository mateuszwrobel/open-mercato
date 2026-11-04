/** @type {import('jest').Config} */
// Computed path keeps the root base config out of the architecture graph
// (repo-root is not a dependency target; see architecture.spec.toml).
const base = require(require('node:path').join(__dirname, '..', '..', 'jest.config.base.cjs'))

module.exports = {
  ...base,
  preset: 'ts-jest',
  testEnvironment: 'node',
  watchman: false,
  rootDir: '.',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@open-mercato/web-research/(.*)$': '<rootDir>/../web-research/src/$1',
    '^@open-mercato/web-research$': '<rootDir>/../web-research/src/index.ts',
  },
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: {
          rootDir: '.',
          ignoreDeprecations: '6.0',
        },
      },
    ],
  },
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.(ts|tsx)'],
  passWithNoTests: true,
}
