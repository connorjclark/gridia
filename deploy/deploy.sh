#!/bin/bash -ex

yarn clean
yarn build-prod
yarn test

# TODO: rsync source code instead of using git on remote server.
ssh root@hoten.cc 'cd gridia/gridia-2019-wip && git pull && ./deploy/install.sh'
echo https://hoten.cc/gridia/

ssh root@hoten.cc 'journalctl -u gridia -f'
