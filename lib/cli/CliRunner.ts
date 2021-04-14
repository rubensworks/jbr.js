import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export function runCli(cwd: string, argv: string[]): void {
  const { argv: params } = yargs(hideBin(argv))
    .commandDir('commands')
    .demandCommand()
    .help();
}
