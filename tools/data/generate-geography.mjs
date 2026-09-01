import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const inputDir = resolve(repoRoot, 'tools/data/input/geography');
const outputDir = resolve(repoRoot, 'src/data/geography');
const mapshaper = resolve(repoRoot, 'node_modules/.bin/mapshaper');
const scales = {
  low: '20m',
  medium: '5m',
  high: '500k',
};
const baseUrl = 'https://www2.census.gov/geo/tiger/GENZ2021/shp';
const stateFips = [
  '01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13',
  '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25',
  '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36',
  '37', '38', '39', '40', '41', '42', '44', '45', '46', '47', '48',
  '49', '50', '51', '53', '54', '55', '56',
];

async function download(scale) {
  const fileName = `cb_2021_us_county_${scale}.zip`;
  const filePath = resolve(inputDir, fileName);
  try {
    await readFile(filePath);
    return filePath;
  } catch {
    // Download only when the ignored source archive is not already present.
  }

  const response = await fetch(`${baseUrl}/${fileName}`);
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download ${fileName}: ${response.status} ${response.statusText}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
  return filePath;
}

function runMapshaper(input, output, filterExpression = '+STATEFP <= 56') {
  const args = [
    '-i', input,
    '-rename-layers', 'counties',
    '-i', input,
    '-rename-layers', 'states',
    '-filter', filterExpression, 'target=counties,states',
    '-each', 'id=GEOID,name=NAME,state=STATEFP', 'target=counties',
    '-filter-fields', 'id,name,state', 'target=counties',
    '-dissolve', 'STATEFP', 'copy-fields=STATEFP', 'target=states',
    '-each', 'id=STATEFP', 'target=states',
    '-filter-fields', 'id', 'target=states',
    '-o', 'target=counties,states', output,
    'format=topojson', 'id-field=id', 'quantization=100000',
  ];

  return new Promise((resolvePromise, reject) => {
    const child = spawn(mapshaper, args, { cwd: repoRoot, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`mapshaper exited with status ${code}`));
    });
  });
}

async function createNames(topologyPath) {
  const topology = JSON.parse(await readFile(topologyPath, 'utf8'));
  const counties = Object.fromEntries(
    topology.objects.counties.geometries
      .map((geometry) => [geometry.id, geometry.properties?.name])
      .filter((entry) => typeof entry[0] === 'string' && typeof entry[1] === 'string')
      .sort(([a], [b]) => a.localeCompare(b)),
  );

  const stateCsv = await readFile(resolve(outputDir, 'reference/state-fips.csv'), 'utf8');
  const states = Object.fromEntries(
    stateCsv.trim().split('\n').slice(1).map((line) => {
      const [name, fips] = line.split(',');
      return [fips, name];
    }),
  );
  await writeFile(resolve(outputDir, 'names.json'), `${JSON.stringify({ states, counties })}\n`);
}

async function main() {
  await mkdir(inputDir, { recursive: true });
  await mkdir(resolve(outputDir, 'topology/high'), { recursive: true });

  const inputs = Object.fromEntries(
    await Promise.all(Object.entries(scales).map(async ([tier, scale]) => [tier, await download(scale)])),
  );

  const lowOutput = resolve(outputDir, 'topology/low.topojson');
  await runMapshaper(inputs.low, lowOutput);
  await runMapshaper(inputs.medium, resolve(outputDir, 'topology/medium.topojson'));

  for (const fips of stateFips) {
    await runMapshaper(
      inputs.high,
      resolve(outputDir, `topology/high/${fips}.topojson`),
      `STATEFP == '${fips}'`,
    );
  }

  await createNames(lowOutput);
}

await main();
