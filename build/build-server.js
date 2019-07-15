const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");

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

// Server expected `world` to be in a parent directory.
copyFolderRecursiveSync("world", "dist");

// tsc outputs the entire `src` folder too ... remove that extra level.
copyFolderRecursiveSync(path.join("dist", "server", "src"), path.join("dist", "server"));
rimraf.sync(path.join("dist", "server", "src"));
