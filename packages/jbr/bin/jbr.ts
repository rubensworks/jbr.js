#!/usr/bin/env node --max_old_space_size=8192
import { runCli } from '../lib/cli/CliRunner';

runCli(process.cwd(), process.argv).catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
