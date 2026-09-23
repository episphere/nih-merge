import { WorkerBridge } from '@jeyabbalas/data-table'
import type { DuckDBBundles } from '@duckdb/duckdb-wasm'
import duckdbEhWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import duckdbEhWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import duckdbMvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import duckdbMvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'

function absoluteAssetUrl(url: string): string {
  // Vite emits root-relative `?url` values in development. DuckDB imports its
  // nested worker from a blob: worker, where importScripts() cannot resolve a
  // path such as `/node_modules/...`; give it a fully qualified URL instead.
  return new URL(url, window.location.href).href
}

function localDuckDBBundles(): DuckDBBundles {
  return {
    mvp: {
      mainModule: absoluteAssetUrl(duckdbMvpWasm),
      mainWorker: absoluteAssetUrl(duckdbMvpWorker),
    },
    eh: {
      mainModule: absoluteAssetUrl(duckdbEhWasm),
      mainWorker: absoluteAssetUrl(duckdbEhWorker),
    },
  }
}

let bridgePromise: Promise<WorkerBridge> | undefined

/** A persistent, same-origin table engine reused across table rebuilds. */
export function getTableBridge(): Promise<WorkerBridge> {
  if (!bridgePromise) {
    const bridge = new WorkerBridge({ duckdbBundles: localDuckDBBundles() })
    bridgePromise = bridge.initialize()
      .then(() => bridge)
      .catch((error) => {
        bridge.terminate()
        bridgePromise = undefined
        throw error
      })
  }
  return bridgePromise
}
