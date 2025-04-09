import { ComputeCoverageOptions, RecordOptions, SaveOptions } from "./index2";
import { StringUtils } from "./utils/StringUtils";

declare global {
  namespace Cypress {
    interface Chainable<Subject> {
      recordApiRequests(options?: Partial<RecordOptions>): Cypress.Chainable<Subject>;
      saveApiRequests(options?: Partial<SaveOptions>): Cypress.Chainable<Subject>;
      computeCoverage(options?: Partial<ComputeCoverageOptions>): Cypress.Chainable<Subject>;
    }
  }
}

let requestsLog: Array<any> = [];
Cypress.Commands.add(
  'recordApiRequests',
  (options?: Partial<RecordOptions>): Cypress.Chainable =>
    cy.task('recordHar', {
      content: false,
      includeBlobs: false,
      rootDir: StringUtils.dirname(Cypress.spec.absolute),
      ...options,
      excludePaths: options?.excludePaths?.map(x =>
        StringUtils.toRegexSource(x)
      ),
      includeHosts: options?.includeHosts?.map(x =>
        StringUtils.toRegexSource(x)
      )
    })
);

Cypress.Commands.add(
  'saveApiRequests',
  (options?: Partial<SaveOptions>): Cypress.Chainable => {
    const fallbackFileName = Cypress.spec.name;
    const outDir = (Cypress.env('hars_folders') as string) ?? './';
    const log = {
      log: {
        version: "1.2",
        pages: [],
        creator: {
          name: "@ivamuno/cypress-api-coverage",
          version: "1.0.0",
          comment: "https://github.com/ivamuno/cypress-api-coverage#readme"
        },
        entries: requestsLog
      }
    };

    requestsLog = [];
    cy.task('saveHar', {
      outDir,
      ...options,
      fileName: StringUtils.normalizeName(
        options?.fileName ?? fallbackFileName,
        !options?.fileName ? { ext: '.har' } : undefined
      )
    });
    return cy.task('saveApiRequestsTask', {
      log,
      outDir,
      ...options,
      fileName: StringUtils.normalizeName(
        options?.fileName ?? fallbackFileName,
        !options?.fileName ? { ext: '.api.har' } : undefined
      )
    });
  }
);

Cypress.Commands.overwrite("request", (originalFn, ...args) => {
  let requestDetails : {url?: string | undefined, method?: string | undefined} = { };
  if(typeof args[0] === "object") {
    requestDetails = { url: args[0].url, method: args[0].method };
  } else {
    const unknownArgs = args as unknown as Array<any>;
    if(unknownArgs.length == 2) {
      requestDetails = { url: unknownArgs[0], method: 'GET' };
    } else if(unknownArgs.length == 3) {
      requestDetails = { url: unknownArgs[1], method: unknownArgs[0] };
    }
  }

  const startedDateTime = Date.now();
  return originalFn(...args).then((response) => {
    const requestEndTime = Date.now();

    requestsLog.push({
      startedDateTime,
      time: requestEndTime - startedDateTime,
      request: {
        method: requestDetails.method || "GET",
        url: requestDetails.url
      },
      response: {
        status: response.status,
        statusText: response.statusText
      }
    });

    return response;
  });
});

Cypress.Commands.add(
  'computeCoverage',
  (options?: Partial<ComputeCoverageOptions>): Cypress.Chainable => {
    const outDir = (Cypress.env('hars_folders') as string) ?? './';
    return cy.task('computeCoverageTask', {
      rootDir: outDir,
      ...options,
      includeHosts: options?.includeHosts?.map(x =>
        StringUtils.toRegexSource(x)
      )
    })
  }
);
