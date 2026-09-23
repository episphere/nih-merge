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

interface PageDefinition {
  key: string
  route: string
  source: string
  output: string
}

const pageDefinitions: PageDefinition[] = [
  { key: 'main', route: '/', source: 'src/pages/index.html', output: 'index.html' },
  { key: 'demographics', route: '/demographics', source: 'src/pages/demographics.html', output: 'demographics/index.html' },
  { key: 'maps', route: '/maps', source: 'src/pages/maps.html', output: 'maps/index.html' },
  { key: 'characteristics', route: '/characteristics', source: 'src/pages/characteristics.html', output: 'characteristics/index.html' },
  { key: 'help', route: '/help', source: 'src/pages/help.html', output: 'help/index.html' },
  { key: 'helpTools', route: '/help/tools', source: 'src/pages/help/tools.html', output: 'help/tools/index.html' },
  { key: 'helpMaps', route: '/help/maps', source: 'src/pages/help/maps.html', output: 'help/maps/index.html' },
  { key: 'helpCharacteristics', route: '/help/characteristics', source: 'src/pages/help/characteristics.html', output: 'help/characteristics/index.html' },
  { key: 'helpDemographics', route: '/help/demographics', source: 'src/pages/help/demographics.html', output: 'help/demographics/index.html' },
  { key: 'helpDataMethods', route: '/help/data-methods', source: 'src/pages/help/data-methods.html', output: 'help/data-methods/index.html' },
  { key: 'helpFaq', route: '/help/faq', source: 'src/pages/help/faq.html', output: 'help/faq/index.html' },
  { key: 'reportIssue', route: '/report-issue', source: 'src/pages/report-issue.html', output: 'report-issue/index.html' },
]

const headerPartialPath = resolve(__dirname, 'src/partials/header.html')
const footerPartialPath = resolve(__dirname, 'src/partials/footer.html')
const documentationSidenavPartialPath = resolve(__dirname, 'src/partials/documentation-sidenav.html')
const partialPaths = [headerPartialPath, footerPartialPath, documentationSidenavPartialPath]

function renderHeader(page: string): string {
  const root = page === 'home' ? './' : page === 'help-detail' ? '../../' : '../'

  return readFileSync(headerPartialPath, 'utf8')
    .replaceAll('{{root}}', root)
    .replace('{{homeCurrent}}', page === 'home' ? ' usa-current' : '')
    .replace('{{reportIssueCurrent}}', page === 'reportissue' ? ' usa-current' : '')
    .replace('{{helpCurrent}}', page === 'help' || page === 'help-detail' ? ' usa-current' : '')
}

function renderDocumentationSidenav(page: string): string {
  const docsRoot = page === 'overview' ? './' : '../'
  const current = (key: string) => page === key ? 'usa-current' : ''
  const aria = (key: string) => page === key ? ' aria-current="page"' : ''
  const isToolPage = ['tools', 'maps', 'characteristics', 'demographics'].includes(page)

  return readFileSync(documentationSidenavPartialPath, 'utf8')
    .replaceAll('{{docsRoot}}', docsRoot)
    .replaceAll('{{overviewCurrent}}', current('overview'))
    .replaceAll('{{overviewAria}}', aria('overview'))
    .replaceAll('{{toolsCurrent}}', current('tools'))
    .replaceAll('{{toolsAncestor}}', isToolPage && page !== 'tools' ? 'usa-current--nci-ancestor' : '')
    .replaceAll('{{toolsAria}}', aria('tools'))
    .replaceAll('{{mapsCurrent}}', current('maps'))
    .replaceAll('{{mapsAria}}', aria('maps'))
    .replaceAll('{{characteristicsCurrent}}', current('characteristics'))
    .replaceAll('{{characteristicsAria}}', aria('characteristics'))
    .replaceAll('{{demographicsCurrent}}', current('demographics'))
    .replaceAll('{{demographicsAria}}', aria('demographics'))
    .replaceAll('{{dataMethodsCurrent}}', current('data-methods'))
    .replaceAll('{{dataMethodsAria}}', aria('data-methods'))
    .replaceAll('{{faqCurrent}}', current('faq'))
    .replaceAll('{{faqAria}}', aria('faq'))
}

function htmlPartials(): Plugin {
  return {
    name: 'html-partials',
    transformIndexHtml(html) {
      return html
        .replace(/    <!-- include:header ([\w-]+) -->/, (_marker, page: string) => renderHeader(page))
        .replace(/          <!-- include:documentation-sidenav ([\w-]+) -->/, (_marker, page: string) => renderDocumentationSidenav(page))
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
        for (const page of pageDefinitions) {
          if (url === page.route || url === `${page.route}/` || url === `${page.route}/index.html`) {
            req.url = `/${page.source}`
            break
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

        const page = pageDefinitions.find((definition) => fileName === definition.source)
        if (!page) continue

        const outputDepth = page.output.split('/').length - 1
        const assetPrefix = outputDepth === 0 ? './' : '../'.repeat(outputDepth)
        chunk.source = (chunk.source as string).replace(/(?:\.\.\/)+(?=(assets|images)\/)/g, assetPrefix)
        chunk.fileName = page.output
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
      input: Object.fromEntries(
        pageDefinitions.map((page) => [page.key, resolve(__dirname, page.source)]),
      ),
    },
  },
  plugins: [htmlPartials(), devCleanUrls(), buildOutputRestructure(), copyDataAssets()],
})
