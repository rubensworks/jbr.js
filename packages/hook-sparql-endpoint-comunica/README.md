# JBR Hook - SPARQL Endpoint Comunica

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/%40jbr-hook%2Fsparql-endpoint-comunica.svg)](https://www.npmjs.com/package/@jbr-hoopk/sparql-endpoint-comunica)

A [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) hook type for a [Comunica](https://github.com/comunica/comunica)-based SPARQL endpoint.

## Requirements

* [Node.js](https://nodejs.org/en/) _(1.12 or higher)_
* [Docker](https://www.docker.com/) _(required for starting a Comunica SPARQL endpoint inside a Docker container)_
* An existing [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) experiment that requires a SPARQL endpoint hook.

## Configure an experiment hook

If an experiment requires a hook for a SPARQL endpoint,
then you can install this Comunica-based SPARQL endpoint as follows.

```bash
$ jbr set-hook someHookSparqlEndpoint sparql-endpoint-comunica
```

## Output

The following output is generated after an experiment with this hook has run.

`output/stats-sparql-endpoint-comunica.csv`: Per second of the experiment: CPU percentage, memory usage (bytes), memory percentage, received bytes, transmitted bytes.
```csv
cpu_percentage,memory,memory_percentage,received,transmitted
9.915362228116711,10489856,0.5024267940030527,488,0
9.863725050505051,17354752,0.8312308965993495,648,0
9.64850952141058,19116032,0.915589944401502,738,0
9.345685076142132,23072768,1.105103526208198,738,0
10.029959365079364,26759168,1.2816689750964243,738,0
10.25411566137566,30363648,1.45431074734269,738,0
```

`output/logs/sparql-endpoint-comunica.txt`: Logs of the Comunica SPARQL endpoint.

## Configuration

When installing this hook, your configuration file (`jbr-experiment.json`) will contain the following:

```text
...
  "someHookSparqlEndpoint": {
    "@id": "urn:jrb:bb:hookSparqlEndpoint",
    "@type": "HookSparqlEndpointComunica",
    "dockerfileClient": "input/dockerfiles/Dockerfile-client",
    "resourceConstraints": {
      "@type": "DockerResourceConstraints",
      "cpu_percentage": 90
    },
    "configClient": "input/config-client.json",
    "clientPort": 3001,
    "clientLogLevel": "info",
    "queryTimeout": 300,
    "maxMemory": 8192
  }
...
```

Any config changes require re-running the prepare step.

More background information on these config options can be found on https://comunica.dev/.

### Configuration fields

* `dockerfileClient`: Path to the Dockerfile of Comunica.
* `resourceConstraints`: Resource constraints for the Docker container.
* `configClient`: Path to the configuration file of a Comunica engine.
* `clientPort`: HTTP port on which the SPARQL endpoint will be exposed.
* `clientLogLevel`: Logging level for Comunica engine.
* `queryTimeout`: Timeout in seconds for a single SPARQL query execution.
* `maxMemory`: Maximum amount of Memory for the Comunica Node.js process in MB.

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
