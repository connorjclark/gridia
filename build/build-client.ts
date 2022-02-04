// yarn ts-node build/build-client.ts

import fs from 'fs';
import path from 'path';

import htmlPlugin from '@chialab/esbuild-plugin-html';
import {NodeGlobalsPolyfillPlugin} from '@esbuild-plugins/node-globals-polyfill';
import esbuild from 'esbuild';
import {nodeBuiltIns} from 'esbuild-node-builtins';
import glob from 'glob';

function copyFileSync(source: string, target: string) {
  let targetFile = target;

  // if target is a directory a new file with the same name will be created
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isDirectory()) {
      targetFile = path.join(target, path.basename(source));
    }
  }

  fs.writeFileSync(targetFile, fs.readFileSync(source));
}

function copyFolderRecursiveSync(source: string, target: string) {
  let files = [];

  // check if folder needs to be created or integrated
  const targetFolder = path.join(target, path.basename(source));
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder);
  }

  // copy
  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach(function(file) {
      const curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, targetFolder);
      } else {
        copyFileSync(curSource, targetFolder);
      }
    });
  }
}

async function buildClient({workerFileName}: { workerFileName: string }) {
  const entries = [
    'src/client/index.html',
    'src/client/ui.html',
    'src/tools/spritesheets.html',
  ];

  const fixPixiBundling: esbuild.Plugin = {
    name: 'fixPixiBundling',
    setup(build) {
      build.onResolve({filter: /mini-signals/}, (args) => {
        return {path: require.resolve('mini-signals')};
      });
    },
  };

  await esbuild.build({
    plugins: [
      // @ts-expect-error
      htmlPlugin(),
      fixPixiBundling,
    ],
    entryPoints: entries,
    entryNames: '[dir]/[name]-[hash]',
    bundle: true,
    loader: {
      '.ttf': 'file', // TODO: remove this
    },
    define: {
      'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
      'process.env.GRIDIA_EXECUTION_ENV': '"browser"',
      'process.env.GRIDIA_SERVER_WORKER_PATH': `"${workerFileName}"`,
    },
    outdir: 'dist',
    minify: true,
    sourcemap: true,
  });

  for (const entry of entries) {
    const fileParts = entry.split('/');
    const file = `./dist/${fileParts[fileParts.length - 1]}`;
    fs.copyFileSync(file, `./dist/client/${fileParts[fileParts.length - 1]}`);
  }

  for (const file of glob.sync('./dist/tools/iife/*.js')) {
    const fileParts = file.split('/');
    const name = fileParts[fileParts.length - 1];
    fs.copyFileSync(file, `./dist/client/iife/${name}`);
  }
}

async function buildWorker() {
  const ignorePlugin: esbuild.Plugin = {
    name: 'ignorePlugin',
    setup(build) {
      build.onResolve({filter: /firebase-admin|fs|perf_hooks/}, (args) => {
        return {path: args.path, external: true};
      });
    },
  };

  const inlineFsPlugin: esbuild.Plugin = {
    name: 'inlineFsPlugin',
    setup(build) {
      build.onLoad({filter: /script-config-reader\.ts/}, (args) => {
        let contents = fs.readFileSync(args.path, 'utf-8');
        // contents = inlineFs(contents, args.path);
        contents = contents.replace(
          'JSON.parse(fs.readFileSync(\'./src/client/ui/components/schemas.json\', \'utf-8\'))',
          fs.readFileSync('./src/client/ui/components/schemas.json', 'utf-8')
        );
        return {contents, loader: 'ts'};
      });
    },
  };

  const results = await esbuild.build({
    plugins: [
      ignorePlugin,
      inlineFsPlugin,
      nodeBuiltIns({include: ['events']}),
      NodeGlobalsPolyfillPlugin({process: true}),
    ],
    entryPoints: ['src/server/run-worker.ts'],
    entryNames: '[dir]/[name]-[hash]',
    bundle: true,
    define: {
      'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
      'process.env.GRIDIA_EXECUTION_ENV': '"browser"',
      'process.env.NODE_DEBUG': 'false',
      'global': 'globalThis',
    },
    outdir: 'dist/client',
    minify: true,
    sourcemap: true,
    write: false,
  });

  for (const outputFile of results.outputFiles) {
    fs.writeFileSync(outputFile.path, outputFile.contents);
  }

  const workerFile = results.outputFiles.find((f) => f.path.endsWith('.js'));
  if (!workerFile) throw new Error('missing worker file');

  return {
    workerFileName: path.basename(workerFile.path),
  };
}

async function main() {
  fs.mkdirSync('./dist/client', {recursive: true});
  const {workerFileName} = await buildWorker();
  await buildClient({workerFileName});
  copyFolderRecursiveSync('worlds', path.join('dist', 'client'));
}

main().catch(console.error);
