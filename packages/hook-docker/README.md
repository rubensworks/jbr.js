# JBR Hook - CLI

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/%40jbr-hook%2Fdocker.svg)](https://www.npmjs.com/package/@jbr-hook/cli)

A [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) hook type for a Docker-based hook.

## Requirements

* [Node.js](https://nodejs.org/en/) _(1.12 or higher)_
* An existing [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) experiment that requires a hook.

## Configure an experiment hook

If an experiment requires a hook,
then you can install this Docker-based hook as follows.

```bash
$ jbr set-hook someHook docker
```

## Output

`output/logs/docker-stdout.txt`: Logs of stdout.
`output/logs/docker-stderr.txt`: Logs of stderr.

## Configuration

When installing this hook, your configuration file (`jbr-experiment.json`) will contain the following:

```text
...
  "someHook": {
    "@id": "urn:jrb:bb:hookSome",
    "@type": "HookDocker",
    "dockerfile": "input/dockerfiles/Dockerfile",
    "resourceConstraints": {
      "@type": "StaticDockerResourceConstraints",
      "cpu_percentage": 100,
    },
    "additionalBinds": [],
    "additionalBindsPrepare": [],
    "innerPort": 3000,
    "outerPort": 3000,
  }
...
```

### Configuration fields

* `dockerfile`: Path to the dockerfile to build and run.
* `resourceConstraints`: Resource constraints for the Docker container.
* `additionalBinds`: The local file bindings to the client dockerfile, e.g. `generated/dataset.hdt.index.v1-1:/tmp/dataset.hdt.index.v1-1`
* `additionalBindsPrepare`: Path to be passed to the image while building, e.g. `input/file.js`
* `innerPort` The port within the container to expose.
* `outerPort` The port on the local machine to bind to.

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
