import { debuglog } from 'util';

export class Logger {
  private static _instance: Logger;
  private readonly _debug = debuglog('cypress-har-generator');

  // eslint-disable-next-line @typescript-eslint/naming-convention
  static get Instance(): Logger {
    if (!this._instance) {
      this._instance = new Logger();
    }

    return this._instance;
  }

  public info(msg: string): void {
    this.log(msg);
  }

  public err(msg: string | Error | unknown): void {
    this.log(JSON.stringify(msg, null, 2));
  }

  public warn(msg: string): void {
    this.log(msg);
  }

  public debug(msg: string): void {
    this._debug(msg);
  }

  private log(msg: string): void {
    // eslint-disable-next-line no-console
    console.log(msg);
  }
}
