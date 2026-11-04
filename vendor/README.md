# Vendored data-table

The app installs `jeyabbalas-data-table-0.10.1-nih.1.tgz`, built from
[`@jeyabbalas/data-table` 0.10.1](https://github.com/jeyabbalas/data-table/tree/8e7f5ec3103b4cf1219f3089143c3203f74aa37c)
at commit `8e7f5ec3103b4cf1219f3089143c3203f74aa37c`, plus
[`data-table-aliases.patch`](./data-table-aliases.patch).

The patch preserves the `aliases` option and `DataTableAliases`, `ValueAlias`,
and `AliasValue` types from our modified 0.7.0 package. Labels are presentation
only: headers, cells, categorical charts, filter chips/panels, hidden-column
chips, and accessibility labels use them. Schema names, actions, SQL,
filter values, sorting, clipboard data, and CSV/JSON/Parquet exports retain
their original names and values. Unmapped values keep upstream formatting;
alias labels are rendered as text.

The statistics-display changes bundled with our 0.7.0 package are now part
of upstream. The patch keeps upstream's newer implementation, including its
fixes for nested columns, lazy column rendering, and scrolling chip bars.

DuckDB WASM is pinned to `1.33.1-dev57.0` because the app self-hosts its WASM
and worker files, and they must match the version used to build data-table's
worker. See the [upstream migration guide](https://github.com/jeyabbalas/data-table/blob/8e7f5ec3103b4cf1219f3089143c3203f74aa37c/docs/migration-guides/from-0.8-to-0.9.md).

## Rebuilding

Requires Node 20.19+ or 22.12+, npm, Git, and network access for the upstream
repository, locked dependencies, and DuckDB's test extensions.

```sh
npm run vendor:data-table
npm install --legacy-peer-deps
npm test
npm run build
```

The app currently needs `--legacy-peer-deps` because NCIDS 3.5.1 declares
a Sass peer range older than the Sass version already used by this project.
This upgrade preserves those existing dependencies.

The rebuild script uses a temporary checkout of the pinned revision, applies
the patch, installs upstream's locked build dependencies, runs the alias
regressions against real DuckDB, builds JavaScript and declarations, and
packs the archive. Normal application installs use the committed archive
and do not require cloning or building the library.

The patch includes `tests/nih-merge/aliases.test.ts`: typed scalar/date/null
aliases, fallback rendering, literal-text labels, facade wiring, column
hide/show, filtering, sorting, and raw CSV/JSON exports. To run the entire
upstream suite in a patched checkout, use `npx vitest run --maxWorkers=4`.

For future updates, change the pinned revision and local version in
`tools/vendor/rebuild-data-table.mjs`, rebase the patch onto that release,
rebuild, update `package.json` to the resulting archive and its required
DuckDB version, then install and run the application checks above.
