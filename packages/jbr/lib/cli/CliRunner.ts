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
    })
    .commandDir('commands')
    .demandCommand()
    .help();
}
