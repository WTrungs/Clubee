import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/** Khớp module của các gói npm đã nêu; tên kết thúc bằng `/` là cả một scope, ví dụ `@radix-ui/`. */
function fromPackages(...names: string[]): RegExp {
  const alternatives = names.map((name) => (name.endsWith('/') ? `${name.slice(0, -1)}[\\\\/][^\\\\/]+` : name.replace('/', '[\\\\/]')))
  return new RegExp(`[\\\\/]node_modules[\\\\/](?:${alternatives.join('|')})[\\\\/]`)
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Same origin as the Spring Boot API so the session cookie and CSRF token work without CORS.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Named vendor chunks keep every file under the 500 kB warning and stay cached across app releases.
        codeSplitting: {
          groups: [
            { name: 'react', test: fromPackages('react', 'react-dom', 'scheduler') },
            { name: 'router', test: fromPackages('react-router') },
            { name: 'query', test: fromPackages('@tanstack/') },
            { name: 'motion', test: fromPackages('motion', 'framer-motion', 'motion-dom', 'motion-utils') },
            {
              name: 'radix',
              test: fromPackages(
                'radix-ui',
                '@radix-ui/',
                '@floating-ui/',
                'react-remove-scroll',
                'react-remove-scroll-bar',
                'react-style-singleton',
                'use-callback-ref',
                'use-sidecar',
                'aria-hidden',
                'get-nonce',
                'tslib',
              ),
            },
            { name: 'forms', test: fromPackages('react-hook-form', '@hookform/', 'zod') },
            { name: 'ui', test: fromPackages('sonner', 'tailwind-merge', 'clsx', 'class-variance-authority', 'lucide-react') },
            { name: 'dnd', test: fromPackages('@dnd-kit/') },
            {
              name: 'msw',
              test: fromPackages('msw', '@mswjs/', '@msw/', '@open-draft/', 'tldts', 'tldts-core', 'tough-cookie', 'rettime', 'outvariant', 'until-async'),
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
