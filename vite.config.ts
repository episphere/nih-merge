import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

function copyParquetFiles() {
  return {
    name: 'copy-parquet',
    closeBundle() {
      const srcDir = resolve(__dirname, 'src/data')
      const destDir = resolve(__dirname, 'epitracker/data')
      mkdirSync(destDir, { recursive: true })
      for (const file of readdirSync(srcDir)) {
        if (file.endsWith('.parquet')) {
          copyFileSync(resolve(srcDir, file), resolve(destDir, file))
        }
      }
    },
  }
}

const pages = ['demographics', 'maps', 'characteristics', 'help'] as const

function devCleanUrls(): Plugin {
  return {
    name: 'dev-clean-urls',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (url === '/' || url === '/index.html') {
          req.url = '/src/pages/index.html'
        } else {
          for (const page of pages) {
            if (url === `/${page}` || url === `/${page}/`) {
              req.url = `/src/pages/${page}.html`
              break
            }
          }
        }
        next()
      })
    },
  }
}

function buildOutputRestructure(): Plugin {
  return {
    name: 'build-output-restructure',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'asset' || !fileName.endsWith('.html')) continue

        if (fileName === 'src/pages/index.html') {
          // Moving from src/pages/index.html → index.html (up two levels)
          // Fix relative paths: ../../X → ./X
          chunk.source = (chunk.source as string).replace(/(?:\.\.\/)+(?=assets\/)/g, './')
          chunk.fileName = 'index.html'
        } else {
          for (const page of pages) {
            if (fileName === `src/pages/${page}.html`) {
              // Moving from src/pages/X.html → X/index.html (up one level)
              // Fix relative paths: ../../X → ../X
              chunk.source = (chunk.source as string).replace(/(?:\.\.\/)+(?=assets\/)/g, '../')
              chunk.fileName = `${page}/index.html`
              break
            }
          }
        }
      }
    },
  }
}

export default defineConfig({
  base: './',
  optimizeDeps: {
    exclude: ['@jeyabbalas/data-table'],
  },
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: [
          resolve(__dirname, 'node_modules/@nciocpl/ncids-css/packages'),
          resolve(__dirname, 'node_modules/@nciocpl/ncids-css/uswds-packages'),
        ],
        silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'slash-div', 'if-function'],
      },
    },
  },
  build: {
    outDir: 'epitracker',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/pages/index.html'),
        demographics: resolve(__dirname, 'src/pages/demographics.html'),
        maps: resolve(__dirname, 'src/pages/maps.html'),
        characteristics: resolve(__dirname, 'src/pages/characteristics.html'),
        help: resolve(__dirname, 'src/pages/help.html'),
      },
    },
  },
  plugins: [devCleanUrls(), buildOutputRestructure(), copyParquetFiles()],
})
