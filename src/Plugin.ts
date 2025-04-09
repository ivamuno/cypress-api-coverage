import { FileManager } from './utils/FileManager';
import {
  bundle,
  loadConfig,
  Oas2Definition,
  Oas3_1Definition,
  Oas3Definition
} from '@redocly/openapi-core';
import chalk from 'chalk';
import { join } from 'path';

export interface SaveTaskOptions {
  log: any;
  fileName: string;
  outDir: string;
}

export interface ComputeCoverageTaskOptions {
  suiteName: string;
  rootDir: string;
  specsPath: string;
  includeHosts: { host: string; replacement?: string }[];
  outputName?: string;
}

interface CoverageResultCoverage {
  total: number;
  totalCovered: number;
}

interface CoverageResult {
  paths: Record<
    string,
    {
      coverage: CoverageResultCoverage;
      verbs: Record<string, { pattern: RegExp; covered: boolean }>;
    }
  >;
  coverage: CoverageResultCoverage;
}

export class Plugin {
  private separator = '#_#';
  private defaultOutputName = 'api-coverage';
  private defaultThresholds = { ok: 70, warning: 50 };

  constructor(private readonly fileManager: FileManager) {}

  public async saveApiRequests(options: SaveTaskOptions): Promise<void> {
    const outDir = options.outDir;
    const filename = options.fileName;
    const filePath = join(outDir, filename);
    this.fileManager.writeFile(filePath, JSON.stringify(options.log, null, 2));
  }

  public async computeCoverage(
    options: ComputeCoverageTaskOptions
  ): Promise<void> {
    const operations = await this.normalizeHar(options);
    const apiSpecs = await this.parseSpecs(options.specsPath);
    this.computeCoverageResult(operations, apiSpecs);
    const apiCoverageOutputName = join(
      options.rootDir,
      (options.outputName || this.defaultOutputName) + '.json'
    );
    await this.fileManager.writeFile(
      apiCoverageOutputName,
      JSON.stringify(apiSpecs, null, 2)
    );
    await this.writeReport(options, apiSpecs);
    this.displayReport(apiSpecs.coverage);
  }

  private async normalizeHar(
    options: ComputeCoverageTaskOptions
  ): Promise<string[]> {
    const files = (await this.fileManager.readDir(options.rootDir)).filter(x =>
      x.endsWith('.har')
    );

    const rawOperations: string[] = [];
    for (const file of files) {
      const data = await this.fileManager.readFile(join(options.rootDir, file));
      if (!data) {
        continue;
      }

      const entries: { request: { method: string; url: string } }[] =
        JSON.parse(data).log.entries;
      for (const entry of entries) {
        const url = entry.request.url.split('?')[0] ?? '';
        for (const host of options.includeHosts) {
          if (url.startsWith(host.host)) {
            const method = entry.request.method;
            const operation = this.buildOperation(
              url.replace(host.host, host.replacement || ''),
              method
            );
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
    const specs: Oas2Definition | Oas3Definition | Oas3_1Definition =
      bundleResults.bundle.parsed;
    const paths = specs.paths || {};

    const result: CoverageResult = {
      paths: {},
      coverage: { total: 0, totalCovered: 0 }
    };
    for (const path of Object.keys(paths)) {
      const operations = paths[path];
      result.paths[path] = {
        coverage: { total: 0, totalCovered: 0 },
        verbs: {}
      };
      for (const v of Object.keys(operations)) {
        const verb = v.toUpperCase();
        const operation = this.buildOperation(path, verb);
        result.paths[path].verbs[verb] = {
          pattern: new RegExp(operation.replace(/\{[^}]*\}/g, '[^/]+')),
          covered: false
        };
        result.paths[path].coverage.total += 1;
        result.coverage.total += 1;
      }
    }

    return result;
  }

  private computeCoverageResult(
    operations: string[],
    coverageResult: CoverageResult
  ): void {
    for (const path of Object.keys(coverageResult.paths)) {
      const verbs = coverageResult.paths[path].verbs;
      for (const v of Object.keys(verbs)) {
        const verb = v.toUpperCase();
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

  private async appendLine(filename: string, line: string) {
    await this.fileManager.appendFile(filename, line);
  }

  private async appendProgress(
    filename: string,
    coverage: CoverageResultCoverage
  ) {
    const progress = Math.round((coverage.totalCovered / coverage.total) * 100);

    const color =
      progress >= this.defaultThresholds.ok
        ? '5cb85c'
        : progress >= this.defaultThresholds.warning
        ? 'f0ad4e'
        : 'd9534f';

    await this.appendLine(
      filename,
      `![](https://progress-bar.xyz/${progress}/?color=${color}&width=500&title=${coverage.totalCovered}/${coverage.total})\r\n\r\n`
    );
  }

  private async writeReport(
    options: ComputeCoverageTaskOptions,
    result: CoverageResult
  ) {
    const apiReportCoverageOutputName = join(
      options.rootDir,
      (options.outputName || this.defaultOutputName) + '.md'
    );
    await this.fileManager.writeFile(apiReportCoverageOutputName, '');
    await this.appendLine(
      apiReportCoverageOutputName,
      `# ${options.suiteName}\r\n\r\n`
    );
    await this.appendLine(apiReportCoverageOutputName, `## Total:\r\n`);
    await this.appendProgress(apiReportCoverageOutputName, result.coverage);

    await this.appendLine(apiReportCoverageOutputName, `## Channels:\r\n`);
    for (const path of Object.keys(result.paths)) {
      await this.appendLine(apiReportCoverageOutputName, `### ${path}\r\n`);
      await this.appendProgress(
        apiReportCoverageOutputName,
        result.paths[path].coverage
      );
    }
  }

  private displayReport(result: CoverageResultCoverage): void {
    const coverage = Math.round((result.totalCovered / result.total) * 100);
    const coverageText = `${coverage}%`;

    // eslint-disable-next-line no-console
    console.log(chalk.bold('\n\nCoverage Report'));
    // eslint-disable-next-line no-console
    console.log(
      chalk.bold('Total:'),
      coverage >= this.defaultThresholds.ok
        ? chalk.green(coverageText)
        : coverage >= this.defaultThresholds.warning
        ? chalk.yellow(coverageText)
        : chalk.red(coverageText)
    );
  }
}
