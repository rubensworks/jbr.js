const config = require('@rubensworks/eslint-config');

module.exports = config([
  {
    files: [ '**/*.ts' ],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: [ './tsconfig.eslint.json' ],
      },
    },
    rules: {
      // jbr is a Node CLI benchmark runner; it cannot avoid fs/path/child_process.
      'import/no-nodejs-modules': 'off',

      'ts/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: [ 'PascalCase' ],
          custom: {
            regex: '^[A-Z]',
            match: true,
          },
        },
      ],
    },
  },
  {
    // The previous .eslintrc setup linted only TypeScript (`eslint . --ext .ts`).
    // Flat config drops `--ext`, so restrict the scope here to keep it unchanged.
    ignores: [
      'node_modules/',
      'coverage/',
      '**/*.js',
      '**/*.d.ts',
      '**/*.js.map',
      '**/*.md',
      '**/*.json',
      '**/*.jsonc',
      '**/*.yml',
      '**/*.yaml',
      '.github/',
      'packages/*/test/test-packages/**/*.ts',
      '**/test/data/',
    ],
  },
]);
