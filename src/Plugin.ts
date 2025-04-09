import { join } from 'path';
import { FileManager } from './utils/FileManager';

export interface SaveTaskOptions {
  log: any;
  fileName: string;
  outDir: string;
}

export interface ComputeCoverageTaskOptions {
  rootDir: string;
  includeHosts?: string[];
}

export class Plugin {
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
    var files = (await this.fileManager.readDir(options.rootDir)).filter(x => x.endsWith('.har'));

    const rawOperations : string[] = [];
    await files.forEach(async file => {
      console.log('file1', file)
      const data = await this.fileManager.readFile(join(options.rootDir, file));
      if (!data) {
        return;
      }

      const entries : { request:{method: string, url: string} }[] = JSON.parse(data).log.entries;
      const separator = '|#|';
      entries
        .filter(e => !options.includeHosts || options.includeHosts.filter(x => x.startsWith(e.request.url)).length > 0)
        .map(e => `${e.request.url.split('?')[0] ?? ''.replace(/\b([a-z]{3})_[a-z0-9]{25,}\b/g, "{ID}")}${separator}${e.request.method}`)
        .forEach(e => {
          if (!rawOperations.includes(e)) {
            rawOperations.push(e);
          }
        });
    });

    const operations = rawOperations.map(e => {
      const parts = e.split('|#|');
      return {
        url: parts[0],
        method: parts[1]
      };
    });

    await this.fileManager.writeFile(join(options.rootDir, 'coverage.json'), JSON.stringify(operations, null, 2));
  }
}
