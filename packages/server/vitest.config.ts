import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    env: loadEnv('test', __dirname, ''),
    // Local Convex + OPENAI_API_KEY. Run with: pnpm test:e2e
    exclude: ['**/node_modules/**', '**/*.e2e.test.ts'],
  },
});
