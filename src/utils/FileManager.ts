import { Logger } from './Logger'
import { promisify } from 'util';
import {
  access,
  constants,
  mkdir,
  unlink,
  writeFile,
  readFile,
  readdir,
  appendFile
} from 'fs';

export class FileManager {
  private static _instance: FileManager;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  static get Instance(): FileManager {
    if (!this._instance) {
      this._instance = new FileManager();
    }

    return this._instance;
  }

  public async readDir(path: string): Promise<string[]> {
    try {
      return await promisify(readdir)(path);
    } catch (e) {
      Logger.Instance.err(e);
      return [];
    }
  }

  public async readFile(path: string): Promise<string | undefined> {
    try {
      return await promisify(readFile)(path, { encoding: 'utf-8' });
    } catch (e) {
      Logger.Instance.err(e);
      return undefined;
    }
  }

  public async writeFile(path: string, data: string): Promise<void> {
    try {
      await this.removeFile(path);
      await promisify(writeFile)(path, data);
    } catch (e) {
      Logger.Instance.err(e);
    }
  }

  public async appendFile(path: string, data: string): Promise<void> {
    try {
      await promisify(appendFile)(path, data);
    } catch (e) {
      Logger.Instance.err(e);
    }
  }

  public async createFolder(path: string): Promise<void> {
    try {
      if (await this.exists(path)) {
        return;
      }

      await promisify(mkdir)(path);
    } catch (e) {
      Logger.Instance.err(e);
    }
  }

  public async removeFile(path: string): Promise<void> {
    try {
      if (await this.exists(path)) {
        await promisify(unlink)(path);
      }
    } catch (e) {
      Logger.Instance.err(e);
    }
  }

  public async exists(path: string): Promise<boolean> {
    try {
      await promisify(access)(path, constants.F_OK);

      return true;
    } catch {
      return false;
    }
  }
}