/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Anchor rootDir to this file's directory so Jest never walks up to the
  // root package.json (which has "type":"module" and no ts-jest config).
  rootDir: __dirname,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      diagnostics: false,
    }],
  },
  testTimeout: 30000,
  // Tell Jest to resolve @nestjs/* and prom-client from nestjs-test/node_modules
  // even when the importing file lives in ../nestjs-reference/
  modulePaths: ['<rootDir>/node_modules'],
  moduleNameMapper: {
    // Intercept JPMC API imports from nestjs-reference/** so no live creds needed
    '^../../src/payroll$':                              '<rootDir>/mocks/payroll.mock.ts',
    '^../../src/jpmorgan_payments$':                    '<rootDir>/mocks/jpmorgan_payments.mock.ts',
    '^../../src/payroll/models/payroll-run\\.model$':   '<rootDir>/mocks/payroll-run.model.mock.ts',
  },
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
};
