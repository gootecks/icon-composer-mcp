import * as path from 'node:path';
import type { BunPlugin } from 'bun';

const target = `${process.platform}-${process.arch}`;
if (target !== 'darwin-arm64' && target !== 'darwin-x64') {
  throw new Error(`build-binary supports macOS only (got ${target})`);
}

const outDir = process.argv[2] ?? 'bin';
const binaries = {
  'icon-composer': 'src/cli.ts',
  'icon-composer-mcp': 'src/server.ts',
};
const sharpDir = path.dirname(Bun.resolveSync('sharp/package.json', process.cwd()));
const addon = Bun.resolveSync(`@img/sharp-${target}/sharp.node`, sharpDir);
const libvipsDir = path.dirname(Bun.resolveSync(`@img/sharp-libvips-${target}/package.json`, path.dirname(addon)));
const libvipsLib = path.join(libvipsDir, 'lib');
const libvipsName = [...new Bun.Glob('libvips-cpp.*.dylib').scanSync(libvipsLib)][0];
if (!libvipsName) throw new Error(`libvips dylib not found in ${libvipsLib}`);
const libvips = path.join(libvipsLib, libvipsName);

const loader = `
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { dlopen } = require('bun:ffi');
const embedded = require(${JSON.stringify(libvips)});
const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'icon-composer');
const target = path.join(cacheDir, ${JSON.stringify(libvipsName)});
const bytes = fs.readFileSync(embedded);
if (!fs.existsSync(target) || fs.statSync(target).size !== bytes.length) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const tmp = target + '.' + process.pid;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, target);
}
dlopen(target, { vips_version: { args: ['int'], returns: 'int' } });
module.exports = require(${JSON.stringify(addon)});
`;

const embedSharp: BunPlugin = {
  name: 'embed-sharp',
  setup(build) {
    build.onLoad({ filter: /[\\/]sharp[\\/]lib[\\/]sharp\.js$/ }, () => ({
      contents: loader,
      loader: 'js',
    }));
  },
};

for (const [name, entry] of Object.entries(binaries)) {
  const outfile = path.join(outDir, name);
  const result = await Bun.build({
    entrypoints: [entry],
    compile: { outfile },
    minify: true,
    plugins: [embedSharp],
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  console.log(`built ${outfile}`);
}
