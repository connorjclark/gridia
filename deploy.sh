#!/bin/bash -ex

rm -rf deploy
mkdir deploy

yarn build
cp -r dist/index.html dist/world dist/gridia.js dist/gridia.map deploy

cd deploy
surge . gridia.surge.sh
echo https://gridia.surge.sh/
