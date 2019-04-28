#!/bin/bash -ex

rm -rf deploy
mkdir deploy
# TODO remove "dist" from deployment.
mkdir deploy/dist

yarn build
cp -r index.html world deploy
cp dist/gridia.js deploy/dist/gridia.js
cp dist/gridia.map deploy/dist/gridia.map

cd deploy
surge . gridia.surge.sh
echo https://gridia.surge.sh/
