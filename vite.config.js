import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Component tests opt in to jsdom with a `// @vitest-environment jsdom` docblock;
    // SQL and build tests stay in plain Node.
    setupFiles: ['./tests/setup.js'],
  },
})