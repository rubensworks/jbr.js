export const command = 'init <name>';
export const desc = 'Initializes a new experiment';
export const builder = {};
export const handler = (argv: Record<string, string>): void => {
  console.log(argv.name); // TODO
};
