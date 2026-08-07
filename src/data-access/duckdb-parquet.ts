import * as duckdb from '@duckdb/duckdb-wasm'
import duckdbEhWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import duckdbEhWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import duckdbMvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import duckdbMvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker },
  eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker },
}

interface Engine {
  db: duckdb.AsyncDuckDB
  connection: duckdb.AsyncDuckDBConnection
}

interface RegisteredDataset {
  fileName: string
  viewName: string
}

let enginePromise: Promise<Engine> | undefined
let nextDatasetId = 0
const MAX_REGISTERED_DATASETS = 6
const viewCache = new Map<string, Promise<RegisteredDataset>>()
let queryQueue: Promise<void> = Promise.resolve()

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

async function createEngine(): Promise<Engine> {
  const bundle = await duckdb.selectBundle(BUNDLES)
  if (!bundle.mainWorker) throw new Error('DuckDB-WASM did not select a worker bundle')

  const worker = new Worker(bundle.mainWorker)
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)

  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
    const connection = await db.connect()
    return { db, connection }
  } catch (error) {
    await db.terminate()
    throw error
  }
}

function getEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = createEngine().catch((error) => {
      enginePromise = undefined
      throw error
    })
  }
  return enginePromise
}

async function registerParquetView(url: string): Promise<RegisteredDataset> {
  const engine = await getEngine()
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch failed ${response.status} for ${url}`)

  const id = nextDatasetId++
  const fileName = `dataset_${id}.parquet`
  const viewName = `dataset_${id}`
  const bytes = new Uint8Array(await response.arrayBuffer())

  await engine.db.registerFileBuffer(fileName, bytes)
  try {
    await engine.connection.query(
      `CREATE VIEW ${quoteIdentifier(viewName)} AS SELECT * FROM read_parquet(${quoteLiteral(fileName)})`,
    )
  } catch (error) {
    await engine.db.dropFile(fileName)
    throw error
  }

  return { fileName, viewName }
}

async function evictOldDatasets(currentUrl: string): Promise<void> {
  const engine = await getEngine()
  while (viewCache.size > MAX_REGISTERED_DATASETS) {
    const oldestUrl = viewCache.keys().next().value as string | undefined
    if (!oldestUrl) return
    if (oldestUrl === currentUrl) {
      const current = viewCache.get(oldestUrl)
      viewCache.delete(oldestUrl)
      if (current) viewCache.set(oldestUrl, current)
      continue
    }

    const oldest = viewCache.get(oldestUrl)
    viewCache.delete(oldestUrl)
    if (!oldest) continue
    const { fileName, viewName } = await oldest
    await engine.connection.query(`DROP VIEW IF EXISTS ${quoteIdentifier(viewName)}`)
    await engine.db.dropFile(fileName)
  }
}

async function getParquetView(url: string): Promise<string> {
  let pending = viewCache.get(url)
  if (pending) {
    // Refresh insertion order so the Map also serves as a small LRU cache.
    viewCache.delete(url)
    viewCache.set(url, pending)
  } else {
    pending = registerParquetView(url)
    viewCache.set(url, pending)
    pending.catch(() => viewCache.delete(url))
  }
  const dataset = await pending
  await evictOldDatasets(url)
  return dataset.viewName
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value)
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (value !== null && typeof value === 'object') {
    const normalized: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) normalized[key] = normalizeValue(nested)
    return normalized
  }
  return value
}

async function runQuery(
  url: string,
  columns: readonly string[],
  whereSql: string,
  parameters: readonly unknown[],
): Promise<Record<string, unknown>[]> {
  const engine = await getEngine()
  const viewName = await getParquetView(url)
  const projection = columns.length > 0 ? columns.map(quoteIdentifier).join(', ') : '*'
  const sql = `SELECT ${projection} FROM ${quoteIdentifier(viewName)} WHERE ${whereSql}`
  const statement = await engine.connection.prepare(sql)

  try {
    const result = await statement.query(...parameters)
    return result.toArray().map((row) => normalizeValue(row.toJSON()) as Record<string, unknown>)
  } finally {
    await statement.close()
  }
}

/**
 * Query a registered Parquet file without expanding the complete file into
 * JavaScript objects. Queries are serialized because the shared DuckDB-WASM
 * connection executes one statement at a time.
 */
export function queryParquet(
  url: string,
  columns: readonly string[],
  whereSql: string,
  parameters: readonly unknown[],
): Promise<Record<string, unknown>[]> {
  const pending = queryQueue.then(() => runQuery(url, columns, whereSql, parameters))
  queryQueue = pending.then(() => undefined, () => undefined)
  return pending
}
