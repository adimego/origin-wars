/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

// Project site: https://adimego.github.io/origin-wars/
const pagesBase = '/origin-wars/'

function githubPagesSpaFallback(): Plugin {
  let outDir = path.resolve(root, 'dist')
  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const indexPath = path.join(outDir, 'index.html')
      // GitHub Pages serves this file for unknown paths under the project site.
      fs.copyFileSync(indexPath, path.join(outDir, '404.html'))
    },
  }
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? pagesBase : '/',
  plugins: [react(), tailwindcss(), githubPagesSpaFallback()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 4317,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
