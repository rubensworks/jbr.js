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

## Configuration

When installing this hook, your configuration file (`jbr-experiment.json`) will contain the following:

```text
...
  "someHookSparqlEndpoint": {
    "@id": "urn:jrb:bb:hookSparqlEndpoint",
    "@type": "HookSparqlEndpointComunica",
    "dockerfileClient": "input/dockerfiles/Dockerfile-client",
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
* `configClient`: Path to the configuration file of a Comunica engine.
* `clientPort`: HTTP port on which the SPARQL endpoint will be exposed.
* `clientLogLevel`: Logging level for Comunica engine.
* `queryTimeout`: Timeout in seconds for a single SPARQL query execution.
* `maxMemory`: Maximum amount of Memory for the Comunica Node.js process in MB.

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
