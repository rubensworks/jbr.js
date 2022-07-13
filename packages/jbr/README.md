# jbr.js – Just a Benchmark Runner

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/jbr.svg)](https://www.npmjs.com/package/jbr)

A simple tool to initialize benchmarking experiments, run them, and analyze their results.

Experiments that are created and executed with this tool are [fully reproducible](https://linkedsoftwaredependencies.org/articles/reproducibility/),
as experiments are fully _deterministic_,
and metadata on all exact installed dependency versions is emitted together with the results.

## Guides

* [Setting up a single Linked Data Fragments experiment](https://github.com/rubensworks/jbr.js/wiki/Example:-setting-up-a-Linked-Data-Fragments-experiment)
* [Setting up a factorial Linked Data Fragments experiment](https://github.com/rubensworks/jbr.js/wiki/Example:-setting-up-a-combinations-based-Linked-Data-Fragments-experiment)

## Requirements

* [Node.js](https://nodejs.org/en/) _(1.12 or higher)_

For certain experiment types, you may also require [Docker](https://www.docker.com/).

## Installation

```bash
$ npm install -g jbr
```
or
```bash
$ yarn global add jbr
```

## Usage

This tool offers commands for executing the whole experimentation chain:

1. [**Initialization**](#1-initialization): Create a new experiment. This should be done only once.
2. [**Data Preparation**](#2-data-preparation): Generating a dataset and query set. This should be done only once.
3. [**Running Experiments**](#3-running-experiments): Starting the required machines and running the benchmark.

**Full usage**:
```text
jbr <command>

Commands:
  jbr clean                      Cleans up an experiment
  jbr generate-combinations      Generate combinations of experiment templates
  jbr init <type> <name>         Initializes a new experiment
  jbr pack                       Create an archive of the experiment output
  jbr prepare                    Prepare data for the current experiment
  jbr run                        Run the current experiment
  jbr set-hook <hook> <handler>  Provide a handler for a hook in an experiment
  jbr validate                   Validate the current experiment

Options:
      --version         Show version number                            [boolean]
      --cwd             The current working directory      [string] [default: .]
  -m, --mainModulePath  Path from which modules should be loaded        [string]
  -v, --verbose         If more logging output should be generated     [boolean]
  -d, --dockerOptions   Path to a file with custom Docker options       [string]
  -b, --breakpoints     If experiment breakpoints are enabled          [boolean]
      --help            Show help
```

### 1. Initialization

```bash
$ jbr init experiment-type my-experiment
$ cd my-experiment
```

Running this command will initialize a new experiment of the given type (`experiment-type`)
in a new directory of the provided experiment name (`my-experiment`).

The experiment type must exist on npm under the `@jbr-experiment/*` scope.
[Click here for a full list of available experiment types.](https://www.npmjs.com/search?q=jbr-experiment)
For example, the `watdiv` experiment can be used because the `@jbr-experiment/watdiv` package exists on npm.

The created directory will contain all default required files for running an experiment.
You can initialize this directory as a [git](https://git-scm.com/) repository.

In most cases, you will have to configure at least one [hook handler](#hooks) for your experiment,
such as defining the SPARQL query engine you want to evaluate for a given benchmark experiment.
Furthermore, you will usually need to edit the `jbr-experiment.json` file to [configure your experiment](#configurability).

### 2. Data Preparation

In order to run all preprocessing steps, such as creating all required datasets, invoke the prepare step:

```bash
$ jbr prepare
```

All prepared files will be contained in the `generated/` directory.

When running this command, existing files within `generated/` will not be overwritten by default.
These can be forcefully overwritten by passing the `-f` option.

### 3. Running Experiments

Once the experiment has been fully configured and prepared, you can run it:

```bash
$ jbr run
```

Once the run step completes, results will be present in the `output/` directory.

## Configurability

All experiments will have a `jbr-experiment.json` in which the properties of an experiment can be set.
The parameters of such a config file are dependent on the type of experiment that is being initialized.

Depending on the experiment type, you may also need to change certain files within the `input/` directory.

## Hooks

Most experiment types expose certain _hooks_, which allow you to plug in certain hook handlers.
For example, the [WatDiv](https://www.npmjs.com/package/@jbr-experiment/watdiv) experiment type exposes the `hookSparqlEndpoint` hook.
This hook is used to plug in a certain SPARQL query engine, which is what WatDiv will use to run its benchmark over.

Hook handler types must exist on npm under the `@jbr-hook/*` scope.
[Click here for a full list of available hook handler types.](https://www.npmjs.com/search?q=jbr-hook)
For example, the `sparql-endpoint-comunica` hook handler can be used because the `@jbr-hook/sparql-endpoint-comunica` package exists on npm.

## Directory structure

A jbr experiment typically has the following directory structure:

```text
my-experiment/
  .gitignore
  jbr-experiment.json  # Main config of your experiment
  package.json
  generated/           # Prepared data files
  input/               # More indirect configuration
  output/              # Raw output of the experiment
  node_modules/
```

To enable reproducibility, it is highly recommended to place these experiments under version control, e.g. via a [git](https://git-scm.com/) repository.

The following files and directories do **not have to be added** to this repository,
as they are derived and can be reproduced:

```text
my-experiment/
  generated/
  output/
  node_modules/
```

## Advanced

### Combinations-based Experiments

Certain experiments may be designed to _compare_ the effect different _factors_ to each other,
such as full factorial experiments, or fractional experiments.
For instance, this may be used to compare the effect of running a certain system once with algorithm A and once with B,
and measuring the effects.

Using jbr, you can easily setup and handle such combination-based experiments as follows:

**1. Initialize experiment**

Experiments that should be combinations-based must be initialized using the `-c` flag:
```bash
$ jbr init -c experiment-type my-experiment
$ cd my-experiment
```

Instead of creating a `jbr-experiment.json` file,
this will create a `jbr-experiment.json.template` file,
together with an accompanying `jbr-combinations.json` file.

**2. Define combinations**

Inside the `jbr-experiment.json.template` file (and input text files), you may define any number of variables using the `%FACTOR-variableName%` syntax.
Inside the `jbr-combinations.json` file, you can define corresponding values for the given variables.

For example, `jbr-experiment.json.template` can look like:
```text
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^1.0.0/components/context.jsonld",
    "https://linkedsoftwaredependencies.org/bundles/npm/@jbr-experiment/ldbc-snb-decentralized/^1.0.0/components/context.jsonld",
    "https://linkedsoftwaredependencies.org/bundles/npm/@jbr-hook/sparql-endpoint-comunica/^1.0.0/components/context.jsonld"
  ],
  "@id": "urn:jrb:experimentname",
  "@type": "MyExperiment",
  "cpu_percentage": %FACTOR-cpu%,
  "memory_percentage": %FACTOR-memory%
}
```
Variable values can be assigned in `jbr-combinations.json`:
```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^1.0.0/components/context.jsonld"
  ],
  "@id": "urn:jrb:experimentname-combinations",
  "@type": "FullFactorialCombinationProvider",
  "commonGenerated": false,
  "factors": {
    "cpu": [ 50, 100 ],
    "memory": [ 50, 100 ]
  }
}
```

Because `FullFactorialCombinationProvider` is used in `jbr-combinations.json`, all combinations (4) of the `cpu` and `memory` variable will apply to this experiment.

_If the generated directory can be reused across combinations, then `commonGenerated` can be set to true._

_`FractionalCombinationProvider` may also be used if only select combinations should apply._

**3. Regenerate combinations**

Each time you make a change inside your input files, `jbr-combinations.json`, or `jbr-experiment.json.template`,
you should (re)generate the instantiated combinations by running the following command:
```bash
$ jbr generate-combinations
```

This will create a new `combinations/` directory, containing sub-directories for all experiment combinations.
Files in this directory should not be modified manually, but should only be managed via the template files and `jbr generate-combinations`.

**4. Handle like any other experiment**

From this point on, you can manage this combinations-based experiment like any other jbr experiment.

Concretely, `jbr prepare` will prepare _all_ combinations,
and `jbr run` will also run _all_ combinations.

If you just want to run a single combination, you can specify its combination id via the `-c` option:
```bash
$ jbr run -c 3
```

### Docker Resource Constraint

Some experiments or hooks may be executed in Docker containers.
For these cases, jbr exposes a reusable helper component for defining Docker resource constraints.

For example, the following experiment is configured to use at most 90% of the CPU, and 10MB of memory.
```json
{
  "@type": "SomeExperiment",
  "resourceConstraints": {
    "@type": "StaticDockerResourceConstraints",
    "cpu_percentage": 90,
    "memory_limit": "10m"
  }
}
```

All possible parameters (all are optional):
* `cpu_percentage`: Percentage (0-100) of the total CPU power that can be used. E.g. when fully consuming 4 cores, this value must be set to 100.
* `memory_limit`: Memory usage limit, e.g. '10m', '1g'.

### Running against a different Docker instance

By default, Docker-based experiment will look for and use the Docker installation on your local machine.
In some cases, you may want to run experiments within remote Docker instances.
In such cases, you can use the `-d` or `--dockerOptions` option to pass a custom Docker options file.

For example, Docker options can be set when running an experiment as follows:
```bash
$ jbr run -d docker-options.json
```

`docker-options.json` for the default socket:
```json
{
    "socketPath": "/var/run/docker.sock"
}
```

`docker-options.json` for running against a different host:
```json
{
    "host": "http://192.168.1.10",
    "port": 3000
}
```

More configuration options can be found at https://github.com/apocas/dockerode#getting-started

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
