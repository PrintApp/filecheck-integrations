import { defineConfig } from 'tsup';

const shared = {
  sourcemap: true,
  treeshake: true,
  target: 'es2022',
  platform: 'node',
} as const;

export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.js' };
    },
  },
  {
    // The CLI is ESM-only: it is the `bin` entry (run via node, "type": "module")
    // and uses top-level await, which CJS cannot express.
    ...shared,
    entry: ['src/cli.ts'],
    format: ['esm'],
    dts: false,
    clean: false,
  },
]);
