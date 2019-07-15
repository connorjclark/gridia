#!/bin/bash -ex

yarn
yarn clean
yarn build-prod

# Client
rsync -ahvz --delete ./dist/client/ /var/www/hoten.cc/public_html/gridia

# Server

# Only make symlink the first time.
[[ ! -e /etc/systemd/system/gridia.service ]] && ln -s /root/gridia/gridia-2019-wip/deploy/gridia.service /etc/systemd/system/gridia.service

# Reload service config.
systemctl daemon-reload

# Register service to run on bootup.
systemctl enable gridia

# Delete world.
rm -rf /root/gridia/gridia-2019-wip/server-data

# Restart.
systemctl restart gridia
