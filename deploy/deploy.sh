#!/bin/bash -ex

ssh root@hoten.cc 'cd gridia/gridia-2019-wip && git pull && ./deploy/install.sh'
echo https://hoten.cc/gridia/

ssh root@hoten.cc 'journalctl -u gridia -f'
