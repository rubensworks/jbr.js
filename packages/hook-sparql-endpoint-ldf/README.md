# JBR Hook - SPARQL Endpoint Linked Data Fragments Server

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/%40jbr-hook%2Fsparql-endpoint-ldf.svg)](https://www.npmjs.com/package/@jbr-hoopk/sparql-endpoint-ldf)

A [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) hook type for an [LDF server-based](https://github.com/LinkedDataFragments/Server.js/) SPARQL endpoint.

Concretely, this hook will start a [Triple Pattern Fragments (TPF) server](https://github.com/LinkedDataFragments/Server.js/)
and an NGINX proxy server that acts as a cache for this TPF server.

## Requirements

* [Node.js](https://nodejs.org/en/) _(1.12 or higher)_
* [Docker](https://www.docker.com/) _(required for starting a LDF server-based SPARQL endpoint inside a Docker container)_
* An existing [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) experiment that requires a SPARQL endpoint hook.

## Configure an experiment hook

If an experiment requires a hook for a SPARQL endpoint,
then you can install this LDF server-based SPARQL endpoint as follows.

```bash
$ jbr set-hook someHookSparqlEndpoint sparql-endpoint-ldf
```

This hook depends on another sub-hook for enabling full SPARQL query execution over the TPF interface, such as sparql-endpoint-comunica:

```bash
$ jbr set-hook someHookSparqlEndpoint/hookSparqlEndpointLdfEngine sparql-endpoint-comunica
```

## Output

The following output is generated after an experiment with this hook has run.

`output/stats-sparql-endpoint-ldf-server.csv` and `output/stats-sparql-endpoint-ldf-cache.csv`: Per second of the experiment: CPU percentage, memory usage (bytes), memory percentage, received bytes, transmitted bytes.
```csv
cpu_percentage,memory,memory_percentage,received,transmitted
9.915362228116711,10489856,0.5024267940030527,488,0
9.863725050505051,17354752,0.8312308965993495,648,0
9.64850952141058,19116032,0.915589944401502,738,0
9.345685076142132,23072768,1.105103526208198,738,0
10.029959365079364,26759168,1.2816689750964243,738,0
10.25411566137566,30363648,1.45431074734269,738,0
```

`output/logs/sparql-endpoint-ldf-server.txt`: Logs of the TPF server.

`output/logs/sparql-endpoint-ldf-cache.txt`: Logs of the proxy cache.

## Configuration

When installing this hook, your configuration file (`jbr-experiment.json`) will contain the following:

```text
...
  "someHookSparqlEndpoint": {
    "@id": "urn:jrb:bb:hookSparqlEndpoint",
    "@type": "HookSparqlEndpointLdf",
    "dockerfile": "input/dockerfiles/Dockerfile-ldf-server",
    "dockerfileCache": "input/dockerfiles/Dockerfile-ldf-server-cache",
    "resourceConstraints": {
      "@type": "StaticDockerResourceConstraints",
      "cpu_percentage": 100
    },
    "config": "input/config-ldf-server.json",
    "portServer": 2999,
    "portCache": 3000,
    "workers": 4,
    "maxMemory": 8192,
    "dataset": "generated/dataset.hdt",
    "hookSparqlEndpointLdfEngine": {
      "@id": "urn:jrb:bb:hookSparqlEndpoint_hookSparqlEndpointLdfEngine",
      "@type": "HookNonConfigured"
    }
  }
...
```

Any config changes require re-running the prepare step.

More background information on these config options can be found on https://github.com/LinkedDataFragments/Server.js/.

### Configuration fields

* `dockerfile`: Path to the Dockerfile of the LDF server.
* `dockerfileClient`: Path to the Dockerfile of the cache proxy.
* `resourceConstraints`: Resource constraints for the Docker container.
* `config`: Path to the configuration file of an LDF server.
* `portServer`: HTTP port on which the LDF server will be exposed on the Docker host.
* `portCache`: HTTP port on which the NGINX server will be exposed on the Docker host.
* `workers`: Number of worker threads for the LDF server.
* `maxMemory`: Maximum amount of Memory for the LDF serve
* `dataset`: HDT file to use as dataset.
* `hookSparqlEndpointLdfEngine`: Sub-hook for an engine that exposes a SPARQL endpoint over this hook.

## Networks

The TPF and NGINX servers will be available in the same Docker virtual network
with the names `ldfserver` (port 3000) and `cache` (port 80).
Any (Docker-supporting) hooks that are plugged into this hook as sub-hook will automatically be part of the same network.

Make sure to target the `cache:80/dataset` as source when executing queries.
If you want to experiment without this cache, you can target `ldfserver:3000/dataset` instead.

By default, the TPF server will be bound to the host machine on port 2999,
and the cache will be bound to port 3000.

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
