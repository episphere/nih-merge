# Data preprocessing

This directory contains local tooling used to create browser datasets in `src/data/`.
`input/legacy/` is intentionally ignored: it may contain large historical source archives and is not shipped with the application.

## Geography

Run `npm run generate:geography` to download the official 2021 Census cartographic
county boundaries and regenerate the committed adaptive TopoJSON assets. The
application intentionally uses the 2021 vintage because later vintages replace
Connecticut's eight legacy counties with planning regions that do not match the
mortality data's FIPS identifiers.

The generated tiers use the Census 1:20,000,000 and 1:5,000,000 national files,
plus state shards from the 1:500,000 file. Source archives are cached under the
ignored `tools/data/input/geography/` directory.
