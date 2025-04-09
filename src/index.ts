import { Plugin } from './Plugin';
import { FileManager } from './utils/FileManager';

new Plugin(FileManager.Instance).computeCoverage({
  suiteName: 'api-coverage',
  rootDir: './src/test/hars',
  specsPath: './src/test/api.yaml',
  includeHosts: [
    { host: 'https://api.sandbox.dev.getpaid.io' },
    { host: 'https://dashboard.dev.getpaid.io/sandbox/v2/dashboard', replacement: '/v2alpha1' },
  ],
  outputName: 'api-coverage',
}).then(() => {
  console.log('Coverage computed successfully.');
});