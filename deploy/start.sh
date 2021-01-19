#!/bin/bash

NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
NODE_VERSION=$(node -e 'console.log(require("./package.json").engines.node)')
nvm use $NODE_VERSION

cd /root/gridia/gridia-2019-wip
node -r source-map-support/register dist/server/server/run.js \
  --ssl-cert /etc/letsencrypt/live/hoten.cc/fullchain.pem \
  --ssl-key /etc/letsencrypt/live/hoten.cc/privkey.pem \
  --verbose
