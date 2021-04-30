#!/bin/bash -ex

systemctl stop gridia
rm -rf server-data
node dist/server/scripts/make-main-world.js
systemctl start gridia
