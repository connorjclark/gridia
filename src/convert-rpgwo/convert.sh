#!/bin/sh -ex

node --loader ts-node/esm src/convert-rpgwo/convert.ts

# mkdir -p world/{arms,legs,chest,weapon,shield,player,head}
# mogrify -format png -quality 93 -transparent white -path world/head src/convert-rpgwo/v1.15/gfx/head*.bmp
# mogrify -format png -quality 93 -transparent white -path world/player src/convert-rpgwo/v1.15/gfx/player*.bmp
# mogrify -format png -quality 93 -transparent white -path world/arms src/convert-rpgwo/v1.15/gfx/arms*.bmp
# mogrify -format png -quality 93 -transparent white -path world/legs src/convert-rpgwo/v1.15/gfx/legs*.bmp
# mogrify -format png -quality 93 -transparent white -path world/chest src/convert-rpgwo/v1.15/gfx/chest*.bmp
# mogrify -format png -quality 93 -transparent white -path world/weapon src/convert-rpgwo/v1.15/gfx/weapon*.bmp
# mogrify -format png -quality 93 -transparent white -path world/shield src/convert-rpgwo/v1.15/gfx/sheild*.bmp
# mv world/shield/sheild0.png world/shield/shield0.png
