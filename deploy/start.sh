#!/bin/bash

NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm

node /root/gridia/gridia-2019-wip/dist/server/run-server.js \
  --ssl-cert /etc/letsencrypt/live/hoten.cc/fullchain.pem \
  --ssl-key /etc/letsencrypt/live/hoten.cc/privkey.pem \
  --verbose