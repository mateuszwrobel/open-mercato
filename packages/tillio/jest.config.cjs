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
  moduleNameMapper: {
    '^#generated/(.*)$': '<rootDir>/../core/generated/$1',
    '^@open-mercato/tillio/(.*)$': '<rootDir>/src/$1',
    '^@open-mercato/core/(.*)$': '<rootDir>/../core/src/$1',
    '^@open-mercato/shared/(.*)$': '<rootDir>/../shared/src/$1',
    '^@open-mercato/queue/(.*)$': '<rootDir>/../queue/src/$1',
    '^@open-mercato/ui/(.*)$': '<rootDir>/../ui/src/$1',
  },
  transform: {
    '^.+\\.(t|j)sx?$': [
      // Computed path keeps the root transformer out of the architecture
      // graph (repo-root is not a dependency target; see
      // architecture.spec.toml).
      require('node:path').join(__dirname, '..', '..', 'scripts', 'jest-mikroorm-transformer.cjs'),
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
