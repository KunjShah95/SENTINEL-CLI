export default {
  testEnvironment: 'node',
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
      branches: 2,
      functions: 3,
      lines: 3,
      statements: 3,
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
  ],
};
