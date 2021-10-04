const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const {nodeBuiltIns} = require('esbuild-node-builtins');

function copyFileSync(source, target) {
  var targetFile = target;

  //if target is a directory a new file with the same name will be created
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isDirectory()) {
      targetFile = path.join(target, path.basename(source));
    }
  }

  fs.writeFileSync(targetFile, fs.readFileSync(source));
}

function copyFolderRecursiveSync(source, target) {
  var files = [];

  //check if folder needs to be created or integrated
  var targetFolder = path.join(target, path.basename(source));
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder);
  }

  //copy
  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach(function (file) {
      var curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, targetFolder);
      } else {
        copyFileSync(curSource, targetFolder);
      }
    });
  }
}

async function buildClient({ workerFileName }) {
  const entries = [
    'src/client/index.html',
    'src/client/ui.html',
    'src/tools/spritesheets.html',
  ];

  let fixPixiBundling = {
    name: 'fixPixiBundling',
    setup(build) {
      build.onResolve({ filter: /mini-signals/ }, args => {
        return { path: require.resolve('mini-signals') }
      })
    },
  }

  const htmlPlugin = (await import('@chialab/esbuild-plugin-html')).default;

  await esbuild.build({
    plugins: [htmlPlugin(), fixPixiBundling],
    entryPoints: entries,
    entryNames: '[dir]/[name]-[hash]',
    bundle: true,
    loader: {
      '.ttf': 'file', // TODO: remove this
    },
    define: {
      'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
      'process.env.GRIDIA_EXECUTION_ENV': '"browser"',
      'process.env.GRIDIA_SERVER_WORKER_PATH': `"../${workerFileName}"`,
    },
    outdir: 'dist',
    minify: true,
    sourcemap: true,
  });

  copyFolderRecursiveSync("worlds", path.join("dist", "client"));
}

async function buildWorker() {
  let ignorePlugin = {
    name: 'ignorePlugin',
    setup(build) {
      build.onResolve({ filter: /firebase-admin|fs|perf_hooks/ }, args => {
        return { path: args.path, external: true }
      })
    },
  }

  const results = await esbuild.build({
    plugins: [ignorePlugin, nodeBuiltIns({include: ['events']})],
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

  return {
    workerFileName: path.basename(results.outputFiles.find(f => f.path.endsWith('.js')).path),
  };
}

async function main() {
  fs.mkdirSync(__dirname + '/../dist/client', { recursive: true });
  const { workerFileName } = await buildWorker();
  await buildClient({ workerFileName });
}

main().catch(console.error);
