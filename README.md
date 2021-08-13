# jbr.js – Just a Benchmark Runner

[![Build status](https://github.com/rubensworks/jbr.js/workflows/CI/badge.svg)](https://github.com/rubensworks/jbr.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/jbr.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/jbr.js?branch=master)
[![npm version](https://badge.fury.io/js/jbr.svg)](https://www.npmjs.com/package/jbr)

A simple tool to initialize benchmarking experiments, run them, and analyze their results.

**[Learn more about how to use jbr here](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr).**

## Development Setup

_(JSDoc: https://rubensworks.github.io/jbr.js/)_

This repository should be used by jvr module **developers** as it contains multiple jbr modules that can be composed.
This repository is managed as a [monorepo](https://github.com/babel/babel/blob/master/doc/design/monorepo.md)
using [Lerna](https://lernajs.io/).

If you want to develop new features
or use the (potentially unstable) in-development version,
you can set up a development environment for jbr.

jbr requires [Node.JS](http://nodejs.org/) 12.0 or higher and the [Yarn](https://yarnpkg.com/en/) package manager.
jbr is tested on OSX, Linux and Windows.

This project can be setup by cloning and installing it as follows:

```bash
$ git clone https://github.com/rubensworks/jbr.js.git
$ cd comunica
$ yarn install
```

**Note: `npm install` is not supported at the moment, as this project makes use of Yarn's [workspaces](https://yarnpkg.com/lang/en/docs/workspaces/) functionality**

This will install the dependencies of all modules, and bootstrap the Lerna monorepo.
After that, all [jbr packages](https://github.com/rubensworks/jbr.js/tree/master/packages) are available in the `packages/` folder
and can be used in a development environment, such as the [main jbr CLI tool](https://github.com/rubensworks/jbr.js/tree/master/packages/jbr).

Furthermore, this will add [pre-commit hooks](https://www.npmjs.com/package/pre-commit)
to build, lint and test.
These hooks can temporarily be disabled at your own risk by adding the `-n` flag to the commit command.

## Adding a new experiment or hook handler

If you want to add a new experiment, you can create one at `packages/experiment-<name>`.
Similarly, hook handlers can be created at `packages/hook-<name>`.
Other experiment and hook handlers can serve as inspiration for implementation.

In order to test your implementation locally, you can make use of globally linked packages.
For this, you can first link `jbr` as follows:
```bash
$ cd packages/jbr
$ yarn link
```

Within the root of the monorepo directory, you can now execute `jbr` commands,
and refer to locally available experiments and hook handlers that are not available on npm (yet).

If you want these experiments or hook handlers to become available on npm (so others can use them as well),
you can contribute them to this repository via a pull requests,
and a maintainer can publish them.

## License

jbr.js is written by [Ruben Taelman](http://www.rubensworks.net/).

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
