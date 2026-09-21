import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { cpSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

function copyDataAssets() {
  return {
    name: 'copy-data-assets',
    closeBundle() {
      const srcDir = resolve(__dirname, 'src/data')
      const destDir = resolve(__dirname, 'nih-merge/assets/data')
      mkdirSync(destDir, { recursive: true })
      cpSync(srcDir, destDir, {
        recursive: true,
        force: true,
        filter: (source) => !source.endsWith('.DS_Store'),
      })
    },
  }
}

const pages = ['demographics', 'maps', 'characteristics', 'help', 'report-issue'] as const

const headerPartialPath = resolve(__dirname, 'src/partials/header.html')
const footerPartialPath = resolve(__dirname, 'src/partials/footer.html')
const partialPaths = [headerPartialPath, footerPartialPath]

function renderHeader(page: string): string {
  const root = page === 'home' ? './' : '../'

  return readFileSync(headerPartialPath, 'utf8')
    .replaceAll('{{root}}', root)
    .replace('{{homeCurrent}}', page === 'home' ? ' usa-current' : '')
    .replace('{{reportIssueCurrent}}', page === 'reportissue' ? ' usa-current' : '')
    .replace('{{helpCurrent}}', page === 'help' ? ' usa-current' : '')
}

function htmlPartials(): Plugin {
  return {
    name: 'html-partials',
    transformIndexHtml(html) {
      return html
        .replace(/    <!-- include:header (\w+) -->/, (_marker, page: string) => renderHeader(page))
        .replace('    <!-- include:footer -->', readFileSync(footerPartialPath, 'utf8'))
    },
    configureServer(server) {
      server.watcher.add(partialPaths)
    },
    handleHotUpdate({ file, server }) {
      if (partialPaths.includes(file)) {
        server.ws.send({ type: 'full-reload' })
        return []
      }
    },
  }
}

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
          chunk.source = (chunk.source as string).replace(/(?:\.\.\/)+(?=(assets|images)\/)/g, './')
          chunk.fileName = 'index.html'
        } else {
          for (const page of pages) {
            if (fileName === `src/pages/${page}.html`) {
              // Moving from src/pages/X.html → X/index.html (up one level)
              // Fix relative paths: ../../X → ../X
              chunk.source = (chunk.source as string).replace(/(?:\.\.\/)+(?=(assets|images)\/)/g, '../')
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
    outDir: 'nih-merge',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/pages/index.html'),
        demographics: resolve(__dirname, 'src/pages/demographics.html'),
        maps: resolve(__dirname, 'src/pages/maps.html'),
        characteristics: resolve(__dirname, 'src/pages/characteristics.html'),
        help: resolve(__dirname, 'src/pages/help.html'),
        reportIssue: resolve(__dirname, 'src/pages/report-issue.html'),
      },
    },
  },
  plugins: [htmlPartials(), devCleanUrls(), buildOutputRestructure(), copyDataAssets()],
})
