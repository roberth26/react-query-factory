import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react({ babel: { plugins: [['babel-plugin-react-compiler', { target: '18' }]] } })],
  resolve: {
    alias: {
      'react-query-factory': new URL('../src/index.ts', import.meta.url).pathname,
    },
  },
});
