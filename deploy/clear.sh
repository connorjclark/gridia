#!/bin/bash -ex

systemctl stop gridia
rm -rf server-data
yarn ts-node src/scripts/make-main-world.ts
systemctl start gridia
