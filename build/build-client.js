const fs = require("fs");
const path = require("path");
const Parcel = require("@parcel/core").default;

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
    files.forEach(function(file) {
      var curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, targetFolder);
      } else {
        copyFileSync(curSource, targetFolder);
      }
    });
  }
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  const dev = flags.has('--dev');
  const entries = [
    'src/client/index.html',
    'src/client/ui.html',
  ];
  const bundler = new Parcel({
    mode: dev ? 'development' : 'production',
    defaultConfig: require.resolve("@parcel/config-default"),
    entries,
    defaultTargetOptions: {
      distDir: "dist/client",
      publicUrl: ".",
      // This break PIXI bundle.
      // TODO: can other bundles be scope hoisted?
      shouldScopeHoist: false,
    },
    // https://github.com/parcel-bundler/parcel/issues/643
    // hmr: false,
    shouldContentHash: !dev,
  });
  if (dev) {
    await bundler.watch();
  } else {
    await bundler.run();
  }
  copyFolderRecursiveSync("world", path.join("dist", "client"));
}

main().catch(console.error);
