const fs = require("fs");
const path = require("path");
const ParcelBundler = require("parcel-bundler");

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
  const dev = process.argv[2] === "--dev";
  const entries = [
    'src/client/index.html',
    'src/client/ui.html',
  ];
  const bundler = new ParcelBundler(entries, {
    outDir: "dist/client",
    publicUrl: ".",
    watch: dev,
    // https://github.com/parcel-bundler/parcel/issues/643
    hmr: false,
    contentHash: !dev,
  });
  await bundler.bundle();
  copyFolderRecursiveSync("worlds", path.join("dist", "client"));
}

main().catch(console.error);
