# JBR Experiment - LDBC SNB Decentralized

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/%40jbr-experiment%2Fldbc-snb-decentralized.svg)](https://www.npmjs.com/package/@jbr-experiment/ldbc-snb-decentralized)

A [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) experiment type for the [decentralized LDBC SNB social network benchmark](https://github.com/rubensworks/ldbc-snb-decentralized.js).

## Requirements

* [Node.js](https://nodejs.org/en/) _(1.12 or higher)_
* [Docker](https://www.docker.com/) _(required for invoking [LDBC SNB generator](https://github.com/ldbc/ldbc_snb_datagen))_
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
$ jbr init ldbc-snb-decentralized my-experiment
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

All prepared files will be contained in the `generated/` directory.

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

`output/logs/server.txt`: Logs of the [Solid Community Server](https://github.com/solid/community-server/).

## Configuration

The default generated configuration file (`jbr-experiment.json`) for this experiment looks as follows:

```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^0.0.0/components/context.jsonld",
    "https://linkedsoftwaredependencies.org/bundles/npm/@jbr-experiment/ldbc-snb-decentralized/^0.0.0/components/context.jsonld"
  ],
  "@id": "urn:jrb:my-experiment",
  "@type": "ExperimentLdbcSnbDecentralized",
  "scale": "0.1",
  "configGenerateAux": "input/config-enhancer.json",
  "configFragment": "input/config-fragmenter.json",
  "configFragmentAux": "input/config-fragmenter-auxiliary.json",
  "configQueries": "input/config-queries.json",
  "configServer": "input/config-server.json",
  "directoryQueryTemplates": "input/templates/queries",
  "overwriteFilesDuringPrepare": false,
  "hadoopMemory": "4G",
  "dockerfileServer": "input/dockerfiles/Dockerfile-server",
  "serverPort": 3000,
  "serverLogLevel": "info",
  "serverResourceConstraints": {
    "@type": "DockerResourceConstraints",
    "cpu_percentage": 10
  },
  "endpointUrl": "http://localhost:3001/sparql",
  "queryRunnerReplication": 3,
  "queryRunnerWarmupRounds": 1,
  "queryRunnerRecordTimestamps": true,
  "hookSparqlEndpoint": {
    "@id": "urn:jrb:cc:hookSparqlEndpoint",
    "@type": "HookNonConfigured"
  }
}
```

Any config changes require re-running the prepare step.

More background information on these config options can be found in the README of the [decentralized LDBC SNB social network benchmark](https://github.com/rubensworks/ldbc-snb-decentralized.js).

### Configuration fields

* `scale`: The SNB scale factor
* `configGenerateAux`: Path to enhancement config for [`ldbc-snb-enhancer`](https://github.com/rubensworks/ldbc-snb-enhancer.js/).
* `configFragment`: Path to fragmentation config for [`rdf-dataset-fragmenter`](https://github.com/rubensworks/rdf-dataset-fragmenter.js).
* `configFragmentAux`: Path to enhancement's fragmentation config for [`rdf-dataset-fragmenter`](https://github.com/rubensworks/rdf-dataset-fragmenter.js).
* `configQueries`: Path to query instantiation config for [`sparql-query-parameter-instantiator`](https://github.com/rubensworks/sparql-query-parameter-instantiator.js).
* `configServer`: Path to server config for [Solid Community Server](https://github.com/solid/community-server/).
* `directoryQueryTemplates`: Path to the directory containing SPARQL query templates for [`sparql-query-parameter-instantiator`](https://github.com/rubensworks/sparql-query-parameter-instantiator.js).
* `overwriteFilesDuringPrepare` A flag to indicate whether or not the fragmentations should always be fully recreated during the prepare step. Otherwise they will be cached until deleted manually.
* `hadoopMemory`: Memory limit for Hadoop for [LDBC SNB](https://github.com/ldbc/ldbc_snb_datagen).
* `dockerfileServer`: Path to a Dockerfile for [Solid Community Server](https://github.com/solid/community-server/).
* `serverPort`: HTTP Port for [Solid Community Server](https://github.com/solid/community-server/).
* `serverLogLevel`: Logging level for [Solid Community Server](https://github.com/solid/community-server/).
* `serverResourceConstraints`: Resource constraints for the [Solid Community Server](https://github.com/solid/community-server/) Docker container.
* `endpointUrl`: URL through which the SPARQL endpoint of the `hookSparqlEndpoint` hook will be exposed.
* `queryRunnerReplication`: Number of replication runs for [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).
* `queryRunnerWarmupRounds`: Number of warmup runs for [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).
* `queryRunnerRecordTimestamps`: Flag to indicate if result arrival timestamps must be recorded [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
