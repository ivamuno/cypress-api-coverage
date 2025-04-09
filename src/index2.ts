import { ComputeCoverageTaskOptions, Plugin, SaveTaskOptions } from './Plugin';
import { FileManager } from './utils/FileManager';
import CypressHarGenerator, {
  install as installHarGenerator
} from '@neuralegion/cypress-har-generator';

const plugin = new Plugin(FileManager.Instance);

export interface RecordOptions {
  rootDir: string;
  filter?: string;
  transform?: string;
  excludePaths?: (string | RegExp)[];
  includeHosts?: (string | RegExp)[];
  excludeStatusCodes?: number[];
}

export interface SaveOptions {
  fileName: string;
  outDir: string;
}

export interface ComputeCoverageOptions {
  outDir: string;
  includeHosts?: string[];
}

export const install = (on: Cypress.PluginEvents): void => {
  installHarGenerator(on);

  on('task', {
    saveApiRequestsTask: async (options: SaveTaskOptions): Promise<null> => {
      await plugin.saveApiRequests(options);

      return null;
    },
    computeCoverageTask: async (
      options: ComputeCoverageTaskOptions
    ): Promise<null> => {
      await plugin.computeCoverage(options);

      return null;
    }
  });

  on(
    'before:browser:launch',
    (
      browser: Cypress.Browser | null,
      launchOptions: Cypress.BeforeBrowserLaunchOptions
    ) => {
      CypressHarGenerator.ensureBrowserFlags(
        (browser ?? {}) as Cypress.Browser,
        launchOptions
      );

      return launchOptions;
    }
  );
};

export { ensureBrowserFlags } from '@neuralegion/cypress-har-generator';
