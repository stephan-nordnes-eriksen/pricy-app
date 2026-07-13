const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'test-e2e',
  timeout: 90_000,
  outputDir: 'test-e2e/__artifacts__',
  use: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
});
