#!/bin/bash -ex

yarn clean
yarn build-client

# TODO: make a site for this, don't use hoten.cc
rsync -ahvz --delete ./dist/client/ root@hoten.cc:/var/www/hoten.cc/public_html/gridia
echo https://hoten.cc/gridia/

# TODO make server daemon, update server files, and restart service.
