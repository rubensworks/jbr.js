# JBR Hook - CLI

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/%40jbr-hook%2Fsparql-endpoint-CLI.svg)](https://www.npmjs.com/package/@jbr-hoopk/sparql-endpoint-CLI)

A [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) hook type for a CLI-based hook.

## Requirements

* [Node.js](https://nodejs.org/en/) _(1.12 or higher)_
* An existing [jbr](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr) experiment that requires a hook.

## Configure an experiment hook

If an experiment requires a hook,
then you can install this CLI-based hook as follows.

```bash
$ jbr set-hook someHook cli
```

## Output

`output/logs/cli-stdout.txt`: Logs of stdout.
`output/logs/cli-stderr.txt`: Logs of stderr.

## Configuration

When installing this hook, your configuration file (`jbr-experiment.json`) will contain the following:

```text
...
  "someHook": {
    "@id": "urn:jrb:bb:hookSome",
    "@type": "HookCli",
    "command": "comunica-sparql-http file@generated/dataset.nt -p 3001",
    "statsFilePath": "stats.csv"
  }
...
```

### Configuration fields

* `command`: Command to execute when starting the experiment.
* `statsFilePath`: Optional path to a CSV file in which the stats of the process will be written.

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
