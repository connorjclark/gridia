#!/bin/bash -ex

rm -rf deploy
mkdir deploy

yarn build
cp -r index.html dist world deploy

# Not used yet.
rm -rf deploy/world/sound

cd deploy
surge . gridia.surge.sh
echo https://gridia.surge.sh/
