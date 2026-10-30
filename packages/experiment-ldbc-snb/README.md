# JBR Experiment - LDBC SNB

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/%40jbr-experiment%2Fldbc-snb.svg)](https://www.npmjs.com/package/@jbr-experiment/ldbc-snb)

A [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) experiment type for the [LDBC Social Network Benchmark (SNB)](https://ldbcouncil.org/benchmarks/snb/) Interactive and Business Intelligence (BI) workloads,
executed over a single (centralized) RDF dataset.

The dataset is generated in Turtle using the [LDBC SNB Hadoop datagen](https://github.com/rubensworks/ldbc_snb_datagen),
merged into a single N-Triples file, and queried using SPARQL versions of the Interactive short (IS1-7) and complex (IC1-14) queries,
and/or the BI (v1, 2018) queries (BI1-24, except BI16), depending on the `workload` configuration field.

## Requirements

* [Node.js](https://nodejs.org/en/) _(18 or higher)_
* [Docker](https://www.docker.com/) _(required for invoking the [LDBC SNB datagen](https://hub.docker.com/r/rubensworks/ldbc_snb_datagen))_
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
$ jbr init ldbc-snb my-experiment
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

This performs the following steps, where each step is skipped if its output already exists (unless `jbr prepare -f` is used):

1. Run the LDBC SNB datagen for the configured scale factor, which produces Turtle files and substitution parameters in `generated/out-snb/`. This is also skipped if `generated/out-snb/` was removed but all files derived from it (steps 2-4) for the configured `workload` exist, such as when using pre-generated assets.
2. Merge all Turtle files into a single `generated/dataset.nt` file. Blank node labels of the datagen are globally unique, and are preserved.
3. Create `generated/parameters-persons.csv` (persons from `interactive_1_param.txt`) and `generated/parameters-messages.csv` (a seeded random sample of posts and comments) for the short queries.
4. Instantiate all Interactive query templates into `generated/queries/` (if `workload` is `interactive` or `all`), and all BI query templates into `generated/queries-bi/` (if `workload` is `bi` or `all`). The BI queries require the datagen's `bi_N_param.txt` files, so if `generated/out-snb/` was removed, BI queries can only be added to existing pre-generated assets by regenerating them (`jbr prepare -f`).
5. Optionally convert the dataset to HDT.

All prepared files will be contained in the `generated/` directory:
```text
generated/
  dataset.hdt                  # If generateHdt is enabled
  dataset.hdt.index.v1-1       # If generateHdt is enabled
  dataset.nt
  out-snb/
    social_network/
      social_network_activity_0_0.ttl
      social_network_person_0_0.ttl
      social_network_static_0_0.ttl
    substitution_parameters/
      bi_1_param.txt
      ...
      interactive_1_param.txt
      ...
  parameters-messages.csv
  parameters-persons.csv
  params.ini
  queries/                     # If workload is interactive or all
    interactive-complex-1.sparql
    ...
    interactive-short-7.sparql
  queries-bi/                  # If workload is bi or all
    bi-1.sparql
    ...
    bi-24.sparql
```

### 5. Run the experiment

Once the experiment has been fully configured and prepared, you can run it:

```bash
$ jbr run
```

Once the run step completes, results will be present in the `output/` directory.

## Output

The following output is generated after an experiment has run.

`output/query-times.csv` (one line per query instantiation, aggregated over the replication rounds):
```csv
name;id;error;errorDescription;failures;hash;httpRequests;httpRequestsMax;httpRequestsMin;httpRequestsStd;replication;results;resultsMax;resultsMin;time;timeMax;timeMin;times;timestamps;timestampsMax;timestampsMin;timestampsStd;timeStd;timestampsAll
interactive-short-4;0;false;;0;2e21f854f7ee6112613cc5912d141bdb;0;0;0;0;3;1;1;1;24.666666666666668;28;22;28 24 22;21.666666666666668;24;20;1.699673171197595;2.494438257849294;"[[20],[24],[21]]"
interactive-short-4;1;false;;0;29533521492a24c11be9676db0f16540;0;0;0;0;3;1;1;1;17.666666666666668;23;13;17 23 13;17.666666666666668;23;13;4.109609335312651;4.109609335312651;"[[17],[23],[13]]"
```

Next to this, `output/query-results-raw.json` contains the raw query results,
and `output/logs/` contains the datagen logs and `load-time.csv`, the time in milliseconds between starting the endpoint and starting the measured queries (this includes the warmup rounds).

## Queries

The query templates in [`lib/templates/queries/`](https://github.com/rubensworks/jbr.js/tree/master/packages/experiment-ldbc-snb/lib/templates/queries)
are based on the SPARQL queries of [SolidBench](https://github.com/SolidBench/SolidBench.js/tree/master/templates/queries),
which in turn are based on the [SNB Interactive SPARQL implementations](https://github.com/ldbc/ldbc_snb_interactive_impls/tree/c19be0e793680497de4e88d360a20708cfcf43a9/sparql/queries),
using the original `http://www.ldbc.eu/ldbc_socialnet/1.0/` vocabulary emitted by the datagen.

Since SPARQL has no shortest path operator, `interactive-complex-13` (single shortest path) only considers paths of at most 4 hops (returning -1 otherwise),
and `interactive-complex-14` (trusted connection paths) only considers shortest paths of at most 3 hops.

Short queries take a `person` or `message` IRI from the generated CSV files.
Complex queries take their parameters from the datagen's `interactive_N_param.txt` files.

The BI query templates in [`lib/templates/queries-bi/`](https://github.com/rubensworks/jbr.js/tree/master/packages/experiment-ldbc-snb/lib/templates/queries-bi)
are based on the [SNB BI SPARQL implementations](https://github.com/ldbc/ldbc_snb_interactive_v1_impls/tree/c19be0e793680497de4e88d360a20708cfcf43a9/sparql/queries),
with the changes listed in [their README](https://github.com/rubensworks/jbr.js/tree/master/packages/experiment-ldbc-snb/lib/templates/queries-bi/README.md).
They take their parameters from the datagen's `bi_N_param.txt` files.
`bi-16` is excluded, since its variable-length path bounds cannot be expressed as a single template, and `bi-25` is excluded since it is empty upstream.

All parameter selections are shuffled deterministically based on `querySeed`.

## Configuration

The default generated configuration file (`jbr-experiment.json`) for this experiment looks as follows:

```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^6.0.0/components/context.jsonld",
    "https://linkedsoftwaredependencies.org/bundles/npm/@jbr-experiment/ldbc-snb/^6.0.0/components/context.jsonld"
  ],
  "@id": "urn:jbr:my-experiment",
  "@type": "ExperimentLdbcSnb",
  "scale": "0.1",
  "hadoopMemory": "4G",
  "queryCount": 5,
  "querySeed": 12345,
  "workload": "interactive",
  "generateHdt": false,
  "endpointUrl": "http://localhost:3001/sparql",
  "endpointUrlExternal": "http://localhost:3001/",
  "queryRunnerReplication": 3,
  "queryRunnerWarmupRounds": 1,
  "queryRunnerRequestDelay": 0,
  "queryRunnerEndpointAvailabilityCheckTimeout": 1000,
  "queryRunnerUrlParams": {},
  "hookSparqlEndpoint": {
    "@id": "urn:jbr:my-experiment:hookSparqlEndpoint",
    "@type": "HookNonConfigured"
  }
}
```

Any config changes require re-running the prepare step.

### Configuration fields

* `scale`: The SNB scale factor, such as `0.1`, `0.3`, `1`, `3`, `10`, ... Defaults to `0.1`.
* `hadoopMemory`: The maximum heap size of the Hadoop datagen, such as `4G`. Higher scale factors require more memory.
* `queryCount`: Number of instantiations per query template. For the Interactive workload, this can not exceed the number of rows in the datagen's substitution parameter files. For the BI workload, parameter rows are repeated if a file has fewer rows (such as `bi_20_param.txt`, which always has 3 rows).
* `querySeed`: Random seed for selecting query parameters.
* `workload`: The workload to prepare and run: `interactive` (queries in `generated/queries/`), `bi` (queries in `generated/queries-bi/`), or `all` (both). Defaults to `interactive`.
* `generateHdt`: If a `dataset.hdt` should also be generated.
* `endpointUrl`: URL through which the SPARQL endpoint of the `hookSparqlEndpoint` hook will be exposed.
* `endpointUrlExternal`: URL through which the SPARQL endpoint of the `hookSparqlEndpoint` hook will be exposed. This will be used for waiting until the endpoint is available.
* `queryRunnerReplication`: Number of replication runs for [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).
* `queryRunnerWarmupRounds`: Number of warmup runs for [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).
* `queryRunnerRequestDelay`: Delay between requests in milliseconds for [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).
* `queryRunnerEndpointAvailabilityCheckTimeout`: Timeout in milliseconds for checking if the SPARQL endpoint is available.
* `queryRunnerUrlParams`: A JSON record of string mappings containing URL parameters that will be passed to the SPARQL endpoint.
* `queryTimeoutFallback`: An optional timeout value for a single query in milliseconds, to be used as fallback in case the SPARQL endpoint hook's timeout fails. This should always be higher than the timeout value configured in the SPARQL endpoint hook.

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
