const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const AcceptanceTestEndpointsCovCollector = require('./acceptance-test-endpoints-cov-collector');
const AcceptanceTestEventsCovCollector = require('./acceptance-test-events-cov-collector');

class AcceptanceTestCovReporter {
  /**
   * constructor for the reporter
   *
   * @param {Object} globalConfig - Jest configuration object
   * @param {Object} options - Options object defined in jest config
   */
  constructor(globalConfig, options) {
    this.globalConfig = globalConfig;
    this.options = options;

    if (/^<rootDir>/.test(this.options.outputDirectory)) {
      this.options.outputDirectory = path.resolve(
        this.globalConfig.rootDir,
        path.normalize(
          './' + this.options.outputDirectory.substr('<rootDir>'.length),
        ),
      );
    }

    this.resultFileName = path.join(
      this.options.outputDirectory,
      this.options.outputName,
    );
    this.resultFileReportName = path.join(
      this.options.outputDirectory,
      this.options.outputReportName,
    );
    this.fileOptions = { encoding: 'utf8' };

    this.collectors = [
      new AcceptanceTestEndpointsCovCollector(
        this.globalConfig,
        this.options,
        this.fileOptions,
      ),
      new AcceptanceTestEventsCovCollector(
        this.globalConfig,
        this.options,
        this.fileOptions,
      ),
    ];
  }

  /**
   * Adapt run results from the file to result
   *
   * @param {runResults} - [ { channel: $path, verb: $verb, discriminator: $statusCode } ]
   * @returns
   *  {
   *    $path : {
   *      $verb : {
   *        $discriminator: 0
   *      }
   *    }
   *  }
   */
  static adaptRunResult(runResults) {
    const result = {};
    for (const runResult of runResults) {
      if (!result[runResult.channel]) {
        result[runResult.channel] = {};
      }

      if (!result[runResult.channel][runResult.verb]) {
        result[runResult.channel][runResult.verb] = {};
      }

      if (!result[runResult.channel][runResult.verb][runResult.discriminator]) {
        result[runResult.channel][runResult.verb][runResult.discriminator] = 0;
      } else {
        result[runResult.channel][runResult.verb][runResult.discriminator]++;
      }
    }

    return result;
  }

  static buildReportTemplate(apiDocSpecs) {
    const report = {};
    for (let [path, verbs] of Object.entries(apiDocSpecs)) {
      report[path] = {};
      for (let [verb, statusCodes] of Object.entries(verbs)) {
        const statusCodesKeys = Object.keys(statusCodes);
        report[path][verb] = {
          covered: [],
          uncovered: statusCodesKeys,
          totalChannel: statusCodesKeys.length,
          totalChannelCovered: 0,
        };
      }
    }

    return report;
  }

  static fillStatusCodeInReportTemplate(
    reportTemplate,
    skipped,
    pathMapping,
    testExecutionResult,
  ) {
    const { path, verb, discriminator } = testExecutionResult;
    const mergePath = pathMapping.find((k) => path.match(k.pattern));
    if (mergePath === undefined) {
      skipped.push({ path, verb, discriminator, reason: 'Path not found' });
      return;
    }

    const reportPath =
      reportTemplate[mergePath.value][verb] ||
      reportTemplate[mergePath.value]['x-amazon-apigateway-any-method'];
    if (reportPath === undefined) {
      skipped.push({
        path,
        verb,
        discriminator,
        reason: 'Verb not found',
        details: reportTemplate[mergePath.value],
      });
      return;
    }

    if (
      [...reportPath.covered, ...reportPath.uncovered].includes(
        discriminator,
      ) === undefined
    ) {
      skipped.push({
        path,
        verb,
        discriminator,
        reason: 'Discriminator not found',
        details: reportPath,
      });
      return;
    }

    if (reportPath.covered.includes(discriminator)) {
      return;
    }

    reportPath.covered.push(discriminator);
    reportPath.uncovered = reportPath.uncovered.filter(
      (code) => code !== discriminator,
    );
    reportPath.totalChannelCovered = reportPath.covered.length;
    reportPath.totalChannel =
      reportPath.covered.length + reportPath.uncovered.length;
  }

  static fillReportTemplate(apiDocSpecs, runResults, reportTemplate, skipped) {
    const pathMapping = Object.keys(apiDocSpecs).map((k) => {
      if (k === '/{catchall+}') {
        return { value: k, pattern: `/catchall` };
      }

      return {
        value: k,
        pattern: `^${k
          .replace('{any+}/', '[^/]+')
          .replace('{any+}', '.+')
          .replace(/\{[^}]*\}/g, '[^/]+')}$`,
      };
    });

    for (const [path, verbs] of Object.entries(runResults)) {
      for (const [verb, statusCodes] of Object.entries(verbs)) {
        for (const statusCode of Object.keys(statusCodes)) {
          const testExecutionResult = {
            path: path.toLowerCase(),
            verb: verb.toLowerCase(),
            discriminator: statusCode,
          };

          AcceptanceTestCovReporter.fillStatusCodeInReportTemplate(
            reportTemplate,
            skipped,
            pathMapping,
            testExecutionResult,
          );
        }
      }
    }
  }

  calculateTotals(report, skipped) {
    const result = { report: [report], total: 0, totalCovered: 0, skipped };
    for (const verbs of Object.values(report)) {
      for (const verbReport of Object.values(verbs)) {
        result.total += verbReport.totalChannel;
        result.totalCovered += verbReport.totalChannelCovered;
      }
    }

    return result;
  }

  static mergeResults(apiDocSpecs, runResults) {
    const report = AcceptanceTestCovReporter.buildReportTemplate(apiDocSpecs);

    const skipped = [];
    AcceptanceTestCovReporter.fillReportTemplate(
      apiDocSpecs,
      runResults,
      report,
      skipped,
    );

    return { report, skipped };
  }

  appendLine(line) {
    fs.appendFileSync(this.resultFileReportName, line, this.fileOptions);
  }

  appendProgress(total, totalCovered) {
    const progress = Math.round((totalCovered / total) * 100) | 0;
    this.appendLine(
      `![](https://progress-bar.dev/${progress}/?width=600&title=${totalCovered}/${total})\r\n\r\n`,
    );
  }

  writeReport(result) {
    fs.writeFileSync(this.resultFileReportName, '', this.fileOptions);
    this.appendLine(`# ${this.options.suiteName}\r\n\r\n`);

    this.appendLine(`## Total:\r\n`);
    this.appendProgress(result.total, result.totalCovered);

    this.appendLine(`## Channels:\r\n`);
    for (const [path, verbs] of Object.entries(result.report[0])) {
      this.appendLine(`### ${path}\r\n`);

      let total = 0;
      let totalCovered = 0;
      for (const verbReport of Object.values(verbs)) {
        total += verbReport.totalChannel;
        totalCovered += verbReport.totalChannelCovered;
      }

      this.appendProgress(total, totalCovered);
    }

    this.appendLine(`## Skipped:\r\n`);
    for (const skipped of result.skipped) {
      this.appendLine(`### ${JSON.stringify(skipped)}\r\n`);
    }
  }

  displayReport(result) {
    const coverage = Math.round((result.totalCovered / result.total) * 100);
    const coverageText = `${coverage}%`;

    console.log(chalk.bold('\n\nCoverage Report'));
    console.log(
      chalk.bold('Total:'),
      coverage >= 70
        ? chalk.green(coverageText)
        : coverage >= 50
        ? chalk.yellow(coverageText)
        : chalk.red(coverageText),
    );
  }

  /**
   * Hook to process the test run before running the tests, the only real data
   * available at this time is the number of test suites about to be executed
   *
   * @param {JestTestRunResult} - Results for the test run, but only `numTotalTestSuites` is of use
   * @param {JestRunConfig} - Run configuration
   */
  async onRunStart(_runResults, _runConfig) {
    await this.collectors.map(async (c) => await c.start());
  }

  /**
   * Hook to process the test run results after a test suite has been executed
   * This will be called many times during the test run
   *
   * @param {JestTestSuiteRunConfig} testRunConfig - Context information about the test run
   * @param {JestTestSuiteResult} testResults - Results for the test suite just executed
   * @param {JestTestRunResult} - Results for the test run at the point in time of the test suite being executed
   */
  onTestResult(_testRunConfig, _testResults, _runResults) {
    // This is intentional to show this method is available.
  }

  /**
   * Hook to process the test run results after all the test suites have been
   * executed
   *
   * @param {string} test - The Test last run
   * @param {JestTestRunResult} - Results from the test run
   */
  async onRunComplete(_test, _runResults) {
    if (this.options.createAccTestCovReport) {
      const mergeResults = await this.collectors
        .map(async (collector) => {
          const { specs, runResultsFromFile } = await collector.collect();
          const runResults =
            AcceptanceTestCovReporter.adaptRunResult(runResultsFromFile);
          return AcceptanceTestCovReporter.mergeResults(specs, runResults);
        })
        .reduce(
          async (acc, promiseResults) => {
            const results = await promiseResults;
            const accumulator = await acc;
            if (results) {
              accumulator.report = Object.assign(
                accumulator.report,
                results.report,
              );
              accumulator.skipped = accumulator.skipped.concat(results.skipped);
            }

            return accumulator;
          },
          { report: {}, skipped: [] },
        );

      const results = this.calculateTotals(
        mergeResults.report,
        mergeResults.skipped,
      );
      fs.writeFileSync(
        this.resultFileName,
        JSON.stringify(results, null, 2),
        this.fileOptions,
      );

      this.writeReport(results);

      this.displayReport(results);
    }
  }
}

module.exports = AcceptanceTestCovReporter;
