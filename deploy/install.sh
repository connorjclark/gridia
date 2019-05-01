#!/bin/bash -ex

git pull
yarn clean
yarn build

# Client
rsync -ahvz --delete ./dist/client/ /var/www/hoten.cc/public_html/gridia

# Server
[[ ! -e /etc/systemd/system/gridia.service ]] ln -s /root/gridia/gridia-2019-wip/deploy/gridia.service /etc/systemd/system/gridia.service
systemctl daemon-reload
systemctl enable gridia
systemctl restart gridia
