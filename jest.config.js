/**
 * Jest runs the jest-style suite (describe/it/expect + @jest/globals):
 * files named *.jest.test.js anywhere in the repo.
 * node:test suites (*.test.js) run via `npm run test:unit` (node --test).
 * The naming split keeps each runner on its own files and avoids the
 * classic "Your test suite must contain at least one test" failure.
 */
export default {
  testEnvironment: 'node',
  // Pure ESM project: run tests as real ES modules (no transpile) with
  // `node --experimental-vm-modules` (wired into the npm scripts).
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/*.jest.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js'],
  coverageDirectory: 'coverage',
  testTimeout: 30000,
  passWithNoTests: true,
};
