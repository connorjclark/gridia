#!/bin/bash

NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
NODE_VERSION=$(node -e 'console.log(require("./package.json").engines.node)')
nvm install $NODE_VERSION

set -ex

# sudo apt-get update
# sudo apt-get install coturn
# systemctl enable coturn
# dig +short hoten.cc | tail -n1
# echo '
# fingerprint
# user=hoten:popgoestheweasel
# lt-cred-mech
# realm=hoten.cc
# log-file=/var/log/turnserver/turnserver.log
# simple-log
# external-ip=165.227.27.153
# ' > /etc/turnserver.conf

# 3478 TCP & UDP
# 49152–65535 UDP
# sudo ufw allow 49152:65535/udp
# sudo ufw allow 3478

yarn
yarn clean
yarn build-prod

# Client
# TODO: Setup webserver too.
rsync -ahvz --delete ./dist/client/ /var/www/hoten.cc/public_html/gridia/play

# Server

# Only make symlink the first time.
[[ ! -e /etc/systemd/system/gridia.service ]] && ln -s /root/gridia/gridia-2019-wip/deploy/gridia.service /etc/systemd/system/gridia.service

# Reload service config.
systemctl daemon-reload

# Register service to run on bootup.
systemctl enable gridia

# Delete world.
# rm -rf /root/gridia/gridia-2019-wip/server-data

# Restart.
systemctl restart gridia
