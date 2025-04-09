"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
var util_1 = require("util");
var Logger = /** @class */ (function () {
    function Logger() {
        this._debug = (0, util_1.debuglog)('cypress-har-generator');
    }
    Object.defineProperty(Logger, "Instance", {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        get: function () {
            if (!this._instance) {
                this._instance = new Logger();
            }
            return this._instance;
        },
        enumerable: false,
        configurable: true
    });
    Logger.prototype.info = function (msg) {
        console.log(msg);
    };
    Logger.prototype.err = function (msg) {
        console.log(msg);
    };
    Logger.prototype.warn = function (msg) {
        console.log(msg);
    };
    Logger.prototype.debug = function (msg) {
        this._debug(msg);
    };
    Logger.prototype.log = function (msg) {
        // eslint-disable-next-line no-console
        console.log(msg);
    };
    return Logger;
}());
exports.Logger = Logger;
