import { join } from 'path';
import { FileManager } from './utils/FileManager';
import { bundle, loadConfig, Oas2Definition, Oas3_1Definition, Oas3Definition } from '@redocly/openapi-core';

export interface SaveTaskOptions {
  log: any;
  fileName: string;
  outDir: string;
}

export interface ComputeCoverageTaskOptions {
  suiteName: string;
  rootDir: string;
  specsPath: string;
  includeHosts: {host: string; replacement?: string }[];
  outputName?: string;
}

interface CoverageResultCoverage {
  total: number;
  totalCovered: number;
}

interface CoverageResult {
  paths: Record<string, { coverage: CoverageResultCoverage, verbs: Record<string, {pattern: RegExp; covered: boolean}> }>;
  coverage: CoverageResultCoverage;
}

export class Plugin {
  separator = '#_#';
  defaultOutputName = 'api-coverage';

  constructor(
    private readonly fileManager: FileManager,
  ) {  }

  public async saveApiRequests(options: SaveTaskOptions): Promise<void> {
    const outDir = options.outDir;
    const filename = options.fileName;
    const filePath = join(outDir, filename);
    this.fileManager.writeFile(filePath, JSON.stringify(options.log, null, 2));
  }

  public async computeCoverage(options: ComputeCoverageTaskOptions): Promise<void> {
    const operations = await this.normalizeHar(options);
    const apiSpecs = await this.parseSpecs(options.specsPath);
    this.computeCoverageResult(operations, apiSpecs);
    const apiCoverageOutputName = (options.outputName || this.defaultOutputName) + '.json';
    await this.fileManager.writeFile(join(options.rootDir, apiCoverageOutputName), JSON.stringify(apiSpecs, null, 2));
    const apiReportCoverageOutputName = (options.outputName || this.defaultOutputName) + '.md';
    await this.fileManager.writeFile(join(options.rootDir, apiReportCoverageOutputName), JSON.stringify(apiSpecs, null, 2));
  }

  private async normalizeHar(options: ComputeCoverageTaskOptions): Promise<string[]> {
    var files = (await this.fileManager.readDir(options.rootDir)).filter(x => x.endsWith('.har'));

    const rawOperations : string[] = [];
    for (const file of files) {
      const data = await this.fileManager.readFile(join(options.rootDir, file));
      if (!data) {
        continue;
      }

      const entries : { request:{method: string, url: string} }[] = JSON.parse(data).log.entries;
      for (const entry of entries) {
        const url = entry.request.url.split('?')[0] ?? '';
        for (const host of options.includeHosts) {
          if (url.startsWith(host.host)) {
            url.replace(host.host, host.replacement || '');
            const method = entry.request.method;
            const operation = this.buildOperation(url, method);
            if (!rawOperations.includes(operation)) {
              rawOperations.push(operation);
            }
            break;
          }
        }
      }
    }

    return rawOperations;
  }

  private async parseSpecs(pathToApi: string): Promise<CoverageResult> {
    const config = await loadConfig();
    const bundleResults = await bundle({ ref: pathToApi, config });
    const specs : Oas2Definition | Oas3Definition | Oas3_1Definition = bundleResults.bundle.parsed;
    const paths = specs.paths || {};

    const result : CoverageResult = { paths: {}, coverage: { total: 0, totalCovered: 0} };
    for (const path in paths) {
      const operations = paths[path];
      result.paths[path] = { coverage: { total: 0, totalCovered: 0 }, verbs: {} };
      for (const verb in Object.keys(operations)) {;
        const operation = this.buildOperation(path, verb);
        result.paths[path].verbs[verb] = { pattern: new RegExp(operation.replace(/\{[^}]*\}/g, '[^/]+')), covered: false };
        result.paths[path].coverage.total += 1;
        result.coverage.total += 1;
      }
    }

    return result;
  }

  private computeCoverageResult(operations: string[], coverageResult: CoverageResult): void {
    for (const path of Object.keys(coverageResult.paths)) {
      const verbs = coverageResult.paths[path].verbs;
      for (const verb of Object.keys(verbs)) {
        if (operations.find(x => verbs[verb].pattern.test(x))) {
          coverageResult.paths[path].verbs[verb].covered = true;
          coverageResult.paths[path].coverage.totalCovered += 1;
          coverageResult.coverage.totalCovered += 1;
        }
      }
    }
  }

  private buildOperation(path: string, method: string): string {
    return `${path}${this.separator}${method}`;
  }
}
