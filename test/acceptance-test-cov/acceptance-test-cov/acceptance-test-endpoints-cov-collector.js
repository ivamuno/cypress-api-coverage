const fs = require('fs');
const AWS = require('aws-sdk');
const path = require('path');
const mkdirp = require('mkdirp');

class AcceptanceTestEndpointsCovCollector {
  /**
   * constructor for the collector
   *
   * @param {Object} globalConfig - Jest configuration object
   * @param {Object} options - Options object defined in jest config
   */
  constructor(globalConfig, options, fileOptions) {
    this.globalConfig = globalConfig;
    this.options = options;
    this.fileOptions = fileOptions;

    this.envVars = {
      awsRegion: process.env.AWS_REGION,
      restApiId: process.env.REST_API_ID,
      awsStage: process.env.AWS_STAGE,
    };
    Object.keys(this.envVars)
      .filter((k) => !this.envVars[k])
      .forEach((k) => console.error('Undefined env var', k));

    this.endpointsAccCovReportTempFileName = path.join(
      this.options.outputDirectory,
      `endpoints-acc-cov-report-temp-${new Date().getTime()}.json`,
    );
    process.env['ENDPOINTS_ACC_COV_TEMP_REPORT_PATH'] =
      this.endpointsAccCovReportTempFileName;
  }

  /**
   * @param {docPaths}
   * {
   *    $path : {
   *      $verb : $swaggerOperation
   *    }
   *  }
   * @returns
   *  {
   *    $path : {
   *      $verb : {
   *        $discriminator: 0
   *      }
   *    }
   *  }
   */
  adaptOpenApiSpec(docPaths) {
    const result = {};
    for (const [docPathKey, docPathValue] of Object.entries(docPaths)) {
      const docPathKeyNormalized = docPathKey.toLowerCase();
      result[docPathKeyNormalized] = {};
      const resultPathValue = result[docPathKeyNormalized];
      for (const [docVerbKey, docVerbValue] of Object.entries(docPathValue)) {
        const docVerbKeyNormalized = docVerbKey.toLowerCase();
        if (docVerbKeyNormalized === 'options') {
          continue;
        }

        resultPathValue[docVerbKeyNormalized] = Object.keys(
          docVerbValue.responses,
        ).reduce((prev, statusCode) => {
          prev[statusCode] = 0;
          return prev;
        }, {});
      }
    }

    return result;
  }

  async getOpenApiSpec() {
    AWS.config.update({ region: this.envVars.awsRegion });
    const apiGateway = new AWS.APIGateway();
    const getExportResult = await apiGateway
      .getExport({
        restApiId: this.envVars.restApiId,
        exportType: 'swagger',
        stageName: this.envVars.awsStage,
        accepts: 'application/json',
      })
      .promise();
    return JSON.parse(getExportResult.body);
  }

  async start() {
    await mkdirp(this.options.outputDirectory);
    fs.writeFileSync(
      this.endpointsAccCovReportTempFileName,
      '',
      this.fileOptions,
    );
  }

  async collect() {
    try {
      const openApiDocPaths = (await this.getOpenApiSpec()).paths;
      const openApiDocSpecs = this.adaptOpenApiSpec(openApiDocPaths);

      const endpointsRunResultsFromFile = fs
        .readFileSync(this.endpointsAccCovReportTempFileName, this.fileOptions)
        .split('\r\n')
        .filter((line) => line.match(/^{.*}$/))
        .map((line) => {
          return JSON.parse(line);
        });

      return { specs: openApiDocSpecs, runResultsFromFile: endpointsRunResultsFromFile };
    } finally {
      fs.rmSync(this.endpointsAccCovReportTempFileName, { force: true });
    }
  }
}

module.exports = AcceptanceTestEndpointsCovCollector;
