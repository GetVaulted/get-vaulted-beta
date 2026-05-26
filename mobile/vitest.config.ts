import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      'react-native': path.resolve(root, 'src/test/stubs/react-native.ts'),
      'expo-device': path.resolve(root, 'src/test/stubs/expo-device.ts'),
    },
  },
});
