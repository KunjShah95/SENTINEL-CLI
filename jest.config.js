export default {
  testEnvironment: 'node',
  // Native ESM: the project is pure ESM ("type":"module"). Jest runs the test
  // and source files as real ES modules (no transpile) when invoked with
  // `node --experimental-vm-modules` (wired into the npm scripts / NODE_OPTIONS).
  // An empty transform disables babel so import.meta + top-level await work.
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js',
    'src/**/*.test.js',
    'src/**/*.spec.js',
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 3,
      functions: 4,
      lines: 4,
      statements: 4,
    },
  },
  testTimeout: 30000,
  passWithNoTests: true,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/frontend/',
    '/__tests__/shared-tools.test.js',
    '/__tests__/server-routes.test.js',
    '/__tests__/server-api.test.js',
    '/__tests__/pr-bot-server.test.js',
    '/__tests__/analyzerWorker.test.js',
    '/__tests__/sast-runner.test.js',
    '/__tests__/linter.test.js',
    '/__tests__/context-compactor.test.js',
    '/__tests__/smartBundler.test.js',
    '/__tests__/reflectionModule.test.js',
    '/__tests__/positioningModule.test.js',
    '/__tests__/fileOperations.test.js',
    '/__tests__/sarifGenerator.test.js',
    // node:test runner suites (run via `node --test` / `npm run test:unit`),
    // not jest — they contain no jest test() blocks.
    '/__tests__/errorHandler.test.js',
    '/__tests__/configValidator.test.js',
    '/__tests__/configManager.test.js',
    '/__tests__/security-middleware.test.js',
  ],
};
