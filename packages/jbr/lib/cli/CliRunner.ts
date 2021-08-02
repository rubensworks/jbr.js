import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export function runCli(cwd: string, argv: string[]): void {
  const { argv: params } = yargs(hideBin(argv))
    .options({
      cwd: { type: 'string', default: cwd, describe: 'The current working directory', defaultDescription: '.' },
      mainModulePath: {
        type: 'string',
        alias: 'm',
        describe: 'Path from which modules should be loaded',
      },
      verbose: {
        type: 'boolean',
        alias: 'v',
        describe: 'If more logging output should be generated',
      },
      dockerOptions: {
        type: 'string',
        alias: 'd',
        describe: 'Path to a file with custom Docker options',
      },
      breakpoints: {
        type: 'boolean',
        alias: 'b',
        describe: 'If experiment breakpoints are enabled',
      },
    })
    .commandDir('commands')
    .demandCommand()
    .help();
}
