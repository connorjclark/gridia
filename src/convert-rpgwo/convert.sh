#!/bin/sh -ex

node --loader ts-node/esm src/convert-rpgwo/convert.ts

# Just players for now.
mogrify -format png -quality 93 -transparent white -path world/player src/convert-rpgwo/v1.15/gfx/player*.bmp
