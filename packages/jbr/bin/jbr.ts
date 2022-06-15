#!/usr/bin/env node --max_old_space_size=8192
import { runCli } from '../lib/cli/CliRunner';
runCli(process.cwd(), process.argv);
