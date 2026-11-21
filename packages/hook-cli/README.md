# JBR Hook - CLI

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/%40jbr-hook%2Fcli.svg)](https://www.npmjs.com/package/@jbr-hook/cli)

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

`output/logs/cli-stdout.txt`: Logs of stdout, or `output/logs/cli-<logName>-stdout.txt` if `logName` is set.
`output/logs/cli-stderr.txt`: Logs of stderr, or `output/logs/cli-<logName>-stderr.txt` if `logName` is set.

## Configuration

When installing this hook, your configuration file (`jbr-experiment.json`) will contain the following:

```text
...
  "someHook": {
    "@id": "urn:jrb:bb:hookSome",
    "@type": "HookCli",
    "entrypoint": [
      "comunica-sparql-http",
      "file@generated/dataset.nt",
      "-p",
      "3001"
    ],
    "statsFilePath": "stats.csv",
    "logName": "endpoint"
  }
...
```

### Configuration fields

* `entrypoint`: Array of command parts to execute when starting the experiment. Except on Windows, the command runs in its own process group, so that stopping the experiment also stops processes it spawned (for example when started via `npx`).
* `statsFilePath`: Optional path to a CSV file in which the stats of the process will be written. CPU and memory usage are summed over the process and all its descendants.
* `logName`: Optional name to include in the names of the log files, such as `output/logs/cli-endpoint-stdout.txt`, so that multiple CLI hooks in an experiment write to separate log files. Without it, the logs are written to `output/logs/cli-stdout.txt` and `output/logs/cli-stderr.txt`.

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
