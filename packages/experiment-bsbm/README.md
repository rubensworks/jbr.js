# JBR Experiment - BSBM

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/%40jbr-experiment%2Fwatdiv.svg)](https://www.npmjs.com/package/@jbr-experiment/watdiv)

A [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) experiment type for the [Berlin SPARQL Benchmark (BSBM)](http://wbsg.informatik.uni-mannheim.de/bizer/berlinsparqlbenchmark/).

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
  td_data/
```

### 5. Run the experiment

Once the experiment has been fully configured and prepared, you can run it:

```bash
$ jbr run
```

Once the run step completes, results will be present in the `output/` directory.

## Output

The following output is generated after an experiment has run.

`output/bsbm.xml`:
```xml
<?xml version="1.0"?><bsbm>
    <querymix>
        <scalefactor>100</scalefactor>
        <warmups>10</warmups>
        <seed>9834533</seed>
        <querymixruns>10</querymixruns>
        <minquerymixruntime>1.9948</minquerymixruntime>
        <maxquerymixruntime>3.5679</maxquerymixruntime>
        <totalruntime>23.993</totalruntime>
        <qmph>1500.46</qmph>
        <cqet>2.39926</cqet>
        <cqetg>2.35945</cqetg>
    </querymix>
    <queries>
        <query nr="1">
            <executecount>10</executecount>
            <aqet>0.007408</aqet>
            <aqetg>0.006883</aqetg>
            <qps>135.00</qps>
            <minqet>0.00484910</minqet>
            <maxqet>0.01610740</maxqet>
            <avgresults>0.10</avgresults>
            <minresults>0</minresults>
            <maxresults>1</maxresults>
            <timeoutcount>0</timeoutcount>
        </query>
    </queries>
</bsbm>
```

More output can be found in `output/logs/bsbm-run.txt`

## Configuration

The default generated configuration file (`jbr-experiment.json`) for this experiment looks as follows:

```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^5.0.0/components/context.jsonld",
    "https://linkedsoftwaredependencies.org/bundles/npm/@jbr-experiment/bsbm/^5.0.0/components/context.jsonld"
  ],
  "@id": "urn:jrb:test-bsbm",
  "@type": "ExperimentBsbm",
  "productCount": 1000,
  "generateHdt": true,
  "endpointUrl": "http://localhost:3001/sparql",
  "endpointUrlExternal": "http://localhost:3001/sparql",
  "warmupRuns": 5,
  "runs": 50,
  "hookSparqlEndpoint": {
    "@id": "urn:jrb:test-watdiv:hookSparqlEndpoint",
    "@type": "HookNonConfigured"
  }
}
```

Any config changes require re-running the prepare step.

More background information on these config options can be found in the README of [WatDiv Docker](https://github.com/comunica/watdiv-docker).

### Configuration fields

* `productCount`: The number of products in the dataset. 91 products make about 50K triples. Defaults to 1000.
* `generateHdt`: If a `dataset.hdt` should also be generated.
* `endpointUrl`: URL through which the SPARQL endpoint of the `hookSparqlEndpoint` hook will be exposed from within the Docker container. When the endpoint is hosted on your main machine outside of Docker, this will be something like `http://host.docker.internal:3001/sparql`.
* `endpointUrlExternal`: URL through which the SPARQL endpoint of the `hookSparqlEndpoint` hook will be exposed. This will be used for waiting until the endpoint is available.
* `warmupRuns`: Number of warmup runs.
* `runs`: Number of actual query runs.

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
