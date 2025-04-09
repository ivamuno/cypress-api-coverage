const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const asyncApiParser = require('@asyncapi/parser');

class AcceptanceTestEventsCovCollector {
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

    this.eventsAccCovReportTempFileName = path.join(
      this.options.outputDirectory,
      `events-acc-cov-report-temp-${new Date().getTime()}.json`,
    );
    process.env['EVENTS_ACC_COV_TEMP_REPORT_PATH'] =
      this.eventsAccCovReportTempFileName;
  }

  /**
   * @param {docPaths} AsyncAPI spec
   * @returns
   *  {
   *    $path : {
   *      $verb : {
   *        $statusCode: 0
   *      }
   *    }
   *  }
   */
  adaptAsyncApiSpec(asyncApiSpecs) {
    const discriminators = ['name', 'eventName'];
    function getProperties(payload) {
      const properties = payload.properties();
      if (Object.keys(properties).length > 0) {
        return properties;
      }

      return payload
        .allOf()
        .map((p) => p.properties())
        .reduce((acc, props) => {
          Object.entries(props).map(([propKey, propValue]) => {
            acc[propKey] = propValue;
          });
          return acc;
        }, {});
    }

    function getDiscriminatorValues(schema) {
      if (schema.const()) {
        return [schema.const()];
      }

      if (schema.enum()) {
        return schema.enum();
      }

      throw new Error('Discriminator value not found');
    }

    const result = {};
    for (const [path, channel] of Object.entries(asyncApiSpecs.channels())) {
      const pathName = `EVENT|${path}`;
      result[pathName] = {};
      const verbs = {};
      verbs[channel.publish.name] = channel.publish();
      verbs[channel.subscribe.name] = channel.subscribe();
      for (const [verbName, verbValue] of Object.entries(verbs)) {
        if (verbValue) {
          result[pathName][verbName] = {};
          for (const message of verbValue.messages()) {
            Object.entries(getProperties(message.payload()))
              .filter(([k, _v]) => discriminators.includes(k))
              .map(([_k, v]) => getDiscriminatorValues(v))
              .reduce((acc, value) => {
                return acc.concat(...value);
              }, [])
              .map((d) => {
                result[pathName][verbName][d] = 0;
              });
          }
        }
      }
    }

    return result;
  }

  async collect() {
    try {
      const fileBuffer = fs.readFileSync('./dist/docs/asyncapi.yml');
      const asyncApiSpecs = await asyncApiParser.parse(fileBuffer.toString());
      const docSpecs = this.adaptAsyncApiSpec(asyncApiSpecs);

      const runResultsFromFile = fs
      .readFileSync(this.eventsAccCovReportTempFileName, this.fileOptions)
        .split('\r\n')
        .filter((line) => line.match(/^{.*}$/))
        .map((line) => {
          const parsedLine = JSON.parse(line);
          return {
            channel: `EVENT|${parsedLine.channel}`,
            verb: parsedLine.verb,
            discriminator: parsedLine.discriminator,
          };
        });
      return { specs: docSpecs, runResultsFromFile: runResultsFromFile };
    } finally {
      fs.rmSync(this.eventsAccCovReportTempFileName, { force: true });
    }
  }

  async start() {
    await mkdirp(this.options.outputDirectory);
    fs.writeFileSync(this.eventsAccCovReportTempFileName, '', this.fileOptions);
  }
}

module.exports = AcceptanceTestEventsCovCollector;
