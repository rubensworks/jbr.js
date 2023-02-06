# JBR Experiment - LDBC SNB Decentralized

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/%40jbr-experiment%2Fwatdiv.svg)](https://www.npmjs.com/package/@jbr-experiment/watdiv)

A [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) experiment type for the [Waterloo SPARQL Diversity Test Suite (WatDiv)](https://dsg.uwaterloo.ca/watdiv/).

## Requirements

* [Node.js](https://nodejs.org/en/) _(1.12 or higher)_
* [Docker](https://www.docker.com/) _(required for invoking [WatDiv Docker](https://github.com/comunica/watdiv-docker))_
* [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) _(required for initializing, preparing, and running experiments on the command line)_

## Quick start

### 1. Install jbr

[jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) is a command line tool that enables experiments to be initialized, prepared, and started.
It can be installed from the npm registry:

```bash
$ npm install -g jbr
```
or
```bash
$ yarn global add jbr
```

### 2. Initialize a new experiment

Using the `jbr` CLI tool, initialize a new experiment:

```bash
$ jbr init watdiv my-experiment
$ cd my-experiment
```

This will create a new `my-experiment` directory with default configs for this experiment type.

### 3. Configure the required hooks

This experiment type requires you to configure a certain SPARQL endpoint to send queries to for the `hookSparqlEndpoint`.
A value for this hook can be set as follows, such as [`sparql-endpoint-comunica`](https://github.com/rubensworks/jbr.js/tree/master/packages/hook-sparql-endpoint-comunica):

```bash
$ jbr set-hook hookSparqlEndpoint sparql-endpoint-comunica
```

### 4. Prepare the experiment

In order to run all preprocessing steps, such as creating all required datasets, invoke the prepare step:

```bash
$ jbr prepare
```

All prepared files will be contained in the `generated/` directory:
```text
generated/
  dataset.hdt
  dataset.hdt.index.v1-1
  dataset.nt
  queries/
```

### 5. Run the experiment

Once the experiment has been fully configured and prepared, you can run it:

```bash
$ jbr run
```

Once the run step completes, results will be present in the `output/` directory.

## Output

The following output is generated after an experiment has run.

`output/query-times.csv`:
```csv
name;id;results;time;timestamps
interactive-short-4;0;0;7;
interactive-short-4;1;0;5;
interactive-short-4;2;0;6;
interactive-short-4;3;0;3;
interactive-short-4;4;0;3;
interactive-short-5;0;0;0;
interactive-short-5;1;0;0;
interactive-short-5;2;0;0;
interactive-short-5;3;0;0;
interactive-short-5;4;0;0;
```

## Configuration

The default generated configuration file (`jbr-experiment.json`) for this experiment looks as follows:

```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^2.0.0/components/context.jsonld",
    "https://linkedsoftwaredependencies.org/bundles/npm/@jbr-experiment/watdiv/^1.0.0/components/context.jsonld"
  ],
  "@id": "urn:jrb:test-watdiv2",
  "@type": "ExperimentWatDiv",
  "datasetScale": 1,
  "queryCount": 5,
  "queryRecurrence": 1,
  "generateHdt": true,
  "endpointUrl": "http://localhost:3001/sparql",
  "queryRunnerReplication": 3,
  "queryRunnerWarmupRounds": 1,
  "queryRunnerRecordTimestamps": true,
  "queryRunnerUrlParamsInit": {},
  "queryRunnerUrlParamsRun": {},
  "hookSparqlEndpoint": {
    "@id": "urn:jrb:test-watdiv2:hookSparqlEndpoint",
    "@type": "HookNonConfigured"
  }
}
```

Any config changes require re-running the prepare step.

More background information on these config options can be found in the README of [WatDiv Docker](https://github.com/comunica/watdiv-docker).

### Configuration fields

* `datasetScale`: Scale factor (1 ~= 100K triples), defaults to 1.
* `queryCount`: Query count per type.
* `queryRecurrence`: Query recurrence factor.
* `generateHdt`: If a `dataset.hdt` should also be generated.
* `endpointUrl`: URL through which the SPARQL endpoint of the `hookSparqlEndpoint` hook will be exposed.
* `queryRunnerReplication`: Number of replication runs for [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).
* `queryRunnerWarmupRounds`: Number of warmup runs for [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).
* `queryRunnerRecordTimestamps`: Flag to indicate if result arrival timestamps must be recorded by [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).
* `queryRunnerRecordHttpRequests`: Flag to indicate if the number of http requests must be reported by [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).
* `queryRunnerUrlParamsInit`: A JSON record of string mappings containing URL parameters that will be passed to the SPARQL endpoint during initialization to check if the endpoint is up.
* `queryRunnerUrlParamsRun`: A JSON record of string mappings containing URL parameters that will be passed to the SPARQL endpoint during query executions.
* `queryTimeoutFallback`: An optional timeout value for a single query in milliseconds, to be used as fallback in case the SPARQL endpoint hook's timeout fails. This should always be higher than the timeout value configured in the SPARQL endpoint hook.

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
