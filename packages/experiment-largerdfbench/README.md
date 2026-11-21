# JBR Experiment - LargeRDFBench

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/%40jbr-experiment%2Flargerdfbench.svg)](https://www.npmjs.com/package/@jbr-experiment/largerdfbench)

A [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) experiment type for the federated query benchmark [LargeRDFBench](https://github.com/dice-group/LargeRDFBench).

The datasets, queries, and expected results are taken from the [LargeRDFBench Interoperable Edition](https://zenodo.org/records/22140177) on Zenodo.
Each dataset is served by its own SPARQL endpoint, and the queries are sent to the SPARQL endpoint of a federation engine over these sources.

By default, this experiment uses the full datasets of the FedBench part of LargeRDFBench (9 datasets with 165 million triples, as HDT files, and the 23 queries S1-S14 and C1-C9).
Optionally, it can use a sample of about 4.1 million of these triples instead, which makes it small enough for CI.
The sample is built so that every query produces exactly the same results over it as over the full data,
and every triple pattern matches the same sources.

## Requirements

* [Node.js](https://nodejs.org/en/) _(18 or higher)_
* [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) _(required for initializing, preparing, and running experiments on the command line)_
* Only for generating a sample: the optional peer dependencies [`hdt`](https://www.npmjs.com/package/hdt) (a native module that requires a C++ compiler), [`@comunica/query-sparql-hdt`](https://www.npmjs.com/package/@comunica/query-sparql-hdt), and [`@comunica/query-sparql-rdfjs`](https://www.npmjs.com/package/@comunica/query-sparql-rdfjs), which are not installed automatically: `npm install hdt @comunica/query-sparql-hdt @comunica/query-sparql-rdfjs`.

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
$ jbr init largerdfbench my-experiment
$ cd my-experiment
```

This will create a new `my-experiment` directory with default configs for this experiment type.

### 3. Configure the required hooks

This experiment type requires two hooks:

* `hookSparqlEndpoint`: The SPARQL endpoint of the federation engine that is benchmarked, which must be exposed at `endpointUrl`.
* `hookSparqlEndpointSources`: A list of hooks that start the SPARQL endpoints of the datasets.
  They are started one by one, in the given order.
  If `sourceUrlsExternal` contains a URL at the index of a hook, the next hook is only started once that URL is available.

This experiment does not dictate how the datasets are served,
but they are available in `generated/datasets/` after the prepare step (see below).
For example, with the [`cli`](https://github.com/rubensworks/jbr.js/tree/master/packages/hook-cli) hook,
each HDT file can be served by [Comunica](https://github.com/comunica/comunica),
with Comunica as federation engine over them, by setting the following in `jbr-experiment.json`:

```text
...
  "sourceUrlsExternal": [
    "http://localhost:4001/sparql",
    "http://localhost:4002/sparql",
    ...
  ],
  "hookSparqlEndpoint": {
    "@id": "urn:jrb:my-experiment:hookSparqlEndpoint",
    "@type": "HookCli",
    "entrypoint": [
      "npx", "comunica-sparql-http",
      "sparql@http://localhost:4001/sparql",
      "sparql@http://localhost:4002/sparql",
      ...
      "-p", "3001"
    ],
    "statsFilePath": "output/stats-engine.csv",
    "logName": "engine"
  },
  "hookSparqlEndpointSources": [
    {
      "@id": "urn:jrb:my-experiment:hookSparqlEndpointSources_ChEBI",
      "@type": "HookCli",
      "entrypoint": [ "npx", "comunica-sparql-hdt-http", "hdt@generated/datasets/ChEBI.hdt", "-p", "4001" ],
      "statsFilePath": "output/stats-ChEBI.csv",
      "logName": "ChEBI"
    },
    {
      "@id": "urn:jrb:my-experiment:hookSparqlEndpointSources_DBPedia-Subset",
      "@type": "HookCli",
      "entrypoint": [ "npx", "comunica-sparql-hdt-http", "hdt@generated/datasets/DBPedia-Subset.hdt", "-p", "4002" ],
      "statsFilePath": "output/stats-DBPedia-Subset.csv",
      "logName": "DBPedia-Subset"
    },
    ...
  ]
...
```

For a sample, the datasets are N-Triples files instead,
which can be served with `comunica-sparql-file-http generated/datasets/ChEBI.nt`.

Alternatively, the hooks can be set via `jbr set-hook`.
As `jbr init` creates a single entry for `hookSparqlEndpointSources`,
first turn it into a list with one entry per dataset in `jbr-experiment.json`,
after which each source can be set by its index:

```bash
$ jbr set-hook hookSparqlEndpoint sparql-endpoint-comunica
$ jbr set-hook hookSparqlEndpointSources/0 cli
```

### 4. Prepare the experiment

In order to run all preprocessing steps, such as downloading the data and creating the sample if enabled, invoke the prepare step:

```bash
$ jbr prepare
```

All prepared files will be contained in the `generated/` directory:
```text
generated/
  zenodo/           The files downloaded from Zenodo
    hdt/            The full datasets as HDT files (only for a sample)
    queries/
    results/        The published expected results
  lineage/          The triples that contribute to the solutions of each query, per dataset (only for a sample)
  datasets/         The datasets to serve: <dataset>.nt for a sample, or <dataset>.hdt for the full data
  queries/          The queries: <query>.sparql
  results/          The expected results: <query>.srj
  manifest.json     The parameters, and statistics of the sample and its validation
```

The prepare step is skipped if `manifest.json`, the datasets, and the queries already exist in `generated/`,
so that a sample that was built before can be reused by extracting it into `generated/`.
Use `jbr prepare -f` to force them to be generated again.

### 5. Run the experiment

Once the experiment has been fully configured and prepared, you can run it:

```bash
$ jbr run
```

Once the run step completes, results will be present in the `output/` directory.

## Sampling

By default, the full HDT files (about 2.6 GB for the FedBench part) are used, with the published expected results.
With `sample` enabled, a sample is created instead:

1. The HDT files, queries, and published results are downloaded from Zenodo.
2. For each query, the triples that contribute to its solutions over the full data are computed.
3. The subjects of each dataset are sampled at their rate in `sampleSubjectRates`, keeping their triples that match a query pattern, and their other triples at `sampleOtherTriplesRate`.
4. The contributing triples are added, and one matching triple for each query pattern that matches the full data but not the sample, so that source selection is unchanged.
5. With `sampleValidate` enabled, prepare fails unless each query produces the same results over the sample as over the full data, which become its expected results.

The same parameters produce a byte-identical sample, which takes about 20 minutes and 7.6 GB of memory (`--max-old-space-size=8192`) with the default sampling parameters.

## Output

The following output is generated after an experiment has run.

`output/query-times.csv`: The aggregated results per query of [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js):
```csv
name;id;error;errorDescription;failures;hash;httpRequests;httpRequestsMax;httpRequestsMin;httpRequestsStd;replication;results;resultsMax;resultsMin;time;timeMax;timeMin;times;timestamps;timestampsMax;timestampsMin;timestampsStd;timeStd;timestampsAll
C3;0;false;;0;6bb056bf1533b491893a1c6ceeb90869;438;438;438;0;3;9;9;9;5933.33;6873;5444;6873 5483 5444;...
```

`output/query-results-raw.json`: The results of each execution of each query.

`output/logs/load-time.csv`: The time in milliseconds to start the sources and the federation engine.

## Configuration

The default generated configuration file (`jbr-experiment.json`) for this experiment looks as follows:

```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^6.0.0/components/context.jsonld",
    "https://linkedsoftwaredependencies.org/bundles/npm/@jbr-experiment/largerdfbench/^6.0.0/components/context.jsonld"
  ],
  "@id": "urn:jrb:my-experiment",
  "@type": "ExperimentLargeRdfBench",
  "zenodoRecord": "22140177",
  "datasets": [ "ChEBI", "DBPedia-Subset", "DrugBank", "GeoNames", "Jamendo", "KEGG", "LMDB", "NYT", "SWDFood" ],
  "queries": [
    "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13", "S14",
    "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9"
  ],
  "sample": false,
  "sampleSubjectRates": {
    "DBPedia-Subset": 0.02,
    "GeoNames": 0.02,
    "LMDB": 0.25
  },
  "sampleOtherTriplesRate": 0.2,
  "sampleSeed": "largerdfbench-sample-v1",
  "sampleValidate": true,
  "generationQueryTimeout": 1800,
  "endpointUrl": "http://localhost:3001/sparql",
  "endpointUrlExternal": "http://localhost:3001/sparql",
  "sourceUrlsExternal": [],
  "queryRunnerReplication": 3,
  "queryRunnerWarmupRounds": 1,
  "queryRunnerRequestDelay": 0,
  "queryRunnerEndpointAvailabilityCheckTimeout": 1000,
  "queryRunnerUrlParams": {},
  "hookSparqlEndpoint": {
    "@id": "urn:jrb:my-experiment:hookSparqlEndpoint",
    "@type": "HookNonConfigured"
  },
  "hookSparqlEndpointSources": {
    "@id": "urn:jrb:my-experiment:hookSparqlEndpointSources",
    "@type": "HookNonConfigured"
  }
}
```

Any config changes require re-running the prepare step.

### Configuration fields

* `zenodoRecord`: The Zenodo record of the LargeRDFBench Interoperable Edition to download from.
* `datasets`: The datasets to include, by their name in the Zenodo record. Defaults to the FedBench datasets.
* `queries`: The queries to include, by their name in the Zenodo record. Defaults to the FedBench queries.
* `sample`: If the datasets must be sampled. Otherwise, the full datasets are used, as HDT files. Defaults to `false`.
* `sampleSubjectRates`: The fraction of subjects to sample per dataset. Datasets that are not listed are not sampled by subject.
* `sampleOtherTriplesRate`: The fraction of the triples of sampled subjects that match no query pattern to keep.
* `sampleSeed`: The seed for sampling.
* `sampleValidate`: If the queries must be validated to produce the same results over the sample as over the full data.
* `generationQueryTimeout`: The timeout in seconds of each query over the full data while generating the sample.
* `endpointUrl`: URL through which the SPARQL endpoint of the `hookSparqlEndpoint` hook will be exposed.
* `endpointUrlExternal`: URL to check if the SPARQL endpoint of the `hookSparqlEndpoint` hook is available. Defaults to `endpointUrl`.
* `sourceUrlsExternal`: URLs to check if each source of `hookSparqlEndpointSources` is available, by index, before starting the next one.
* `queryRunnerReplication`: Number of replication runs for [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).
* `queryRunnerWarmupRounds`: Number of warmup runs for [`sparql-benchmark-runner`](https://github.com/comunica/sparql-benchmark-runner.js).
* `queryRunnerRequestDelay`: Delay between requests in milliseconds.
* `queryRunnerEndpointAvailabilityCheckTimeout`: Timeout in milliseconds of each check if the SPARQL endpoint is available.
* `queryRunnerUrlParams`: A JSON record of string mappings containing URL parameters that will be passed to the SPARQL endpoint.
* `queryTimeoutFallback`: An optional timeout value for a single query in milliseconds, to be used as fallback in case the SPARQL endpoint hook's timeout fails. This should always be higher than the timeout value configured in the SPARQL endpoint hook.

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
