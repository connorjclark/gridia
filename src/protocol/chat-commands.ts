import {MAX_STACK, MINE, SECTOR_SIZE} from '../constants.js';
import * as Content from '../content.js';
import * as CommandParser from '../lib/command-parser.js';
import {makeBareMap} from '../mapgen.js';
import {PlayerConnection} from '../server/client-connection.js';
import {Server} from '../server/server.js';
import * as Utils from '../utils.js';

import * as EventBuilder from './event-builder.js';

export function processChatCommand(server: Server, playerConnection: PlayerConnection, text: string) {
  const creature = playerConnection.creature;

  const CHAT_COMMANDS: Record<string, CommandParser.Command> = {
    time: {
      args: [],
      do() {
        playerConnection.sendEvent(EventBuilder.chat({
          section: 'World',
          from: 'World',
          text: `The time is ${server.context.time.toString()}`,
        }));
      },
    },
    who: {
      args: [],
      do() {
        playerConnection.sendEvent(EventBuilder.chat({
          section: 'World',
          from: 'World',
          text: server.getMessagePlayersOnline(),
        }));
      },
    },
    landClaim: {
      args: [
        {name: 'server', type: 'boolean', optional: true},
      ],
      do(args: { server?: boolean }) {
        if (args.server && !playerConnection.player.isAdmin) return 'not allowed';

        const sectorPoint = Utils.worldToSector(creature.pos, SECTOR_SIZE);
        const id = args.server ? 'SERVER' : playerConnection.player.id;
        return server.claimSector(id, creature.pos.w, sectorPoint)?.error;
      },
    },
    landUnclaim: {
      args: [],
      do() {
        const id = server.getSectorOwner(creature.pos);
        if (!id) return 'land is not claimed';

        if (id === 'SERVER') {
          if (!playerConnection.player.isAdmin) return 'not allowed';
        } else {
          if (id !== playerConnection.player.id) return 'not allowed';
        }

        const sectorPoint = Utils.worldToSector(creature.pos, SECTOR_SIZE);
        server.claimSector('', creature.pos.w, sectorPoint);
      },
    },
    landOwner: {
      args: [],
      do() {
        const id = server.getSectorOwner(creature.pos);
        if (!id) {
          playerConnection.sendEvent(EventBuilder.chat({
            section: 'World',
            from: 'World',
            text: 'Unclaimed',
          }));
          return;
        }

        const player = server.context.players.get(id);
        playerConnection.sendEvent(EventBuilder.chat({
          section: 'World',
          from: 'World',
          text: player?.name || id,
        }));
      },
    },
    save: {
      args: [],
      do() {
        server.save().then(() => {
          playerConnection.sendEvent(EventBuilder.chat({
            section: 'World',
            from: 'World',
            text: 'Server saved.',
          }));
        });
      },
    },
    // image: {
    //   args: [
    //     {name: 'index', type: 'number'},
    //     {name: 'file', type: 'string', optional: true},
    //     {name: 'width', type: 'number', optional: true},
    //     {name: 'height', type: 'number', optional: true},
    //   ],
    //   do(args: { index: number; file?: string; width?: number; height?: number }) {
    //     clientConnection.creature.graphics = {
    //       file: args.file || 'rpgwo-player0.png',
    //       frames: [args.index],
    //       width: args.width || 1,
    //       height: args.height || 1,
    //     };
    //     server.broadcastPartialCreatureUpdate(clientConnection.creature, ['graphics']);
    //   },
    // },
    image: {
      args: [
        {name: 'monsterId', type: 'number'},
      ],
      do(args: { monsterId: number }) {
        const monster = Content.getMonsterTemplate(args.monsterId);

        // Hacky way to allow setting graphic back to default 3 player images.
        if (server.context.worldDataDefinition.baseDir === 'worlds/rpgwo-world') {
          if (args.monsterId !== 0 && monster) {
            playerConnection.creature.graphics = {
              ...monster.graphics,
            };
          } else {
            playerConnection.creature.graphics = {
              file: 'rpgwo-player0.png',
              frames: [Utils.randInt(0, 3)],
            };
          }
          server.broadcastPartialCreatureUpdate(playerConnection.creature, ['graphics']);
          // Equipment graphics might change.
          server.updateCreatureDataBasedOnEquipment(
            playerConnection.creature, playerConnection.equipment, {broadcast: true});
          return;
        }

        if (!monster) return;

        playerConnection.creature.graphics = {
          ...monster.graphics,
        };
        server.broadcastPartialCreatureUpdate(playerConnection.creature, ['graphics']);
      },
    },
    animation: {
      args: [
        {name: 'name', type: 'string'},
      ],
      do(args: { name: string }) {
        const animation = Content.getAnimation(args.name);
        if (!animation) {
          server.send(EventBuilder.chat({
            section: 'World',
            from: 'SERVER',
            text: `No animation named ${args.name}`,
          }), playerConnection);
          return;
        }

        server.broadcastAnimation({
          name: args.name,
          path: [playerConnection.creature.pos],
        });
      },
    },
    write: {
      args: [
        {name: 'content', type: 'string'},
      ],
      do(args: { content: string }) {
        const pos = {...playerConnection.creature.pos};
        pos.y -= 1;

        const item = server.context.map.getItem(pos);
        if (!item || !Content.getMetaItem(item.type).readable) return 'invalid item';

        item.textContent = args.content;
      },
    },
    debugTile: {
      args: [],
      do() {
        const pos = {...playerConnection.creature.pos};

        const tile = server.context.map.getTile(pos);
        server.send(EventBuilder.chat({
          section: 'World',
          from: 'SERVER',
          text: JSON.stringify(tile, null, 2),
        }), playerConnection);
      },
    },
    help: {
      args: [],
      do() {
        let messageBody = 'Commands:\n';
        const sortedCommands = Object.entries(CHAT_COMMANDS).sort((a, b) => a[0].localeCompare(b[0]));
        for (const [commandName, data] of sortedCommands) {
          const args = data.args.map((a) => `${a.name} [${a.type}${a.optional ? '?' : ''}]`).join(' ');
          messageBody += `/${commandName} ${args}\n`;
          if (data.help) messageBody += `  ${data.help}\n`;
        }
        server.send(EventBuilder.chat({
          section: 'World',
          from: 'SERVER',
          text: messageBody,
        }), playerConnection);
      },
    },
  };

  const ADMIN_CHAT_COMMANDS: Record<string, CommandParser.Command> = {
    warp: {
      args: [
        {name: 'x', type: 'number'},
        {name: 'y', type: 'number'},
        {name: 'z', type: 'number', optional: true},
        {name: 'map', type: 'number', optional: true},
      ],
      do(args: { x: number; y: number; z?: number; map?: number }) {
        const destination = {...playerConnection.creature.pos};
        if (args.z !== undefined && args.map !== undefined) {
          destination.w = args.map;
          destination.x = args.x;
          destination.y = args.y;
          destination.z = args.z;
        } else if (args.z !== undefined) {
          destination.x = args.x;
          destination.y = args.y;
          destination.z = args.z;
        } else {
          destination.x = args.x;
          destination.y = args.y;
        }

        if (!server.context.map.inBounds(destination)) {
          return 'out of bounds';
        }

        if (!server.context.walkable(destination)) {
          // Don't check this?
          return 'not walkable';
        }

        server.warpCreature(playerConnection.creature, destination, {warpAnimation: true});
      },
    },
    warpTo: {
      args: [
        {name: 'playerName', type: 'string'},
      ],
      do(args: { playerName: string }) {
        const playerId = server.context.playerNamesToIds.get(args.playerName);
        if (!playerId) return; // TODO
        const player = server.context.players.get(playerId);
        if (!player) return;

        const creature2 = server.findCreatureForPlayer(player);
        if (!creature2) return;

        const pos = server.findNearestWalkableTile({pos: creature2.pos, range: 10});
        if (!pos) return;

        server.warpCreature(creature, pos, {warpAnimation: true});
      },
    },
    creature: {
      args: [
        {name: 'name', type: 'string'},
      ],
      do(args: { name: string }) {
        const template = Content.getMonsterTemplateByNameNoError(args.name);
        if (!template) {
          server.send(EventBuilder.chat({
            section: 'World',
            from: 'SERVER',
            text: `No monster named ${args.name}`,
          }), playerConnection);
          return;
        }

        const pos = server.findNearestWalkableTile({pos: playerConnection.creature.pos, range: 10});
        if (pos) {
          server.createCreature({type: template.id}, pos);
        }
      },
    },
    item: {
      args: [
        {name: 'nameOrId', type: 'string'},
        {name: 'quantity', type: 'number', optional: true},
      ],
      do(args: { nameOrId: string; quantity?: number }) {
        let meta;
        if (args.nameOrId.match(/\d+/)) {
          meta = Content.getMetaItem(parseInt(args.nameOrId, 10));
        } else {
          meta = Content.getMetaItemByName(args.nameOrId);
        }
        if (!meta) {
          server.send(EventBuilder.chat({
            section: 'World',
            from: 'SERVER',
            text: `No item: ${args.nameOrId}`,
          }), playerConnection);
          return;
        }

        let quantity = args.quantity || 1;
        if (quantity > MAX_STACK) quantity = MAX_STACK;

        const pos = server.findNearest({pos: playerConnection.creature.pos, range: 10}, true,
          (t) => !t.item);
        if (pos) {
          server.setItemInWorld(pos, {type: meta.id, quantity});
        }
      },
    },
    who: {
      args: [],
      do() {
        playerConnection.sendEvent(EventBuilder.chat({
          section: 'World',
          from: 'World',
          text: server.getMessagePlayersOnline(),
        }));
      },
    },
    newPartition: {
      args: [
        {name: 'name', type: 'string'},
        {name: 'width', type: 'number'},
        {name: 'height', type: 'number'},
        {name: 'depth', type: 'number', optional: true},
      ],
      do(args: { name: string; width: number; height: number; depth?: number }) {
        const nextPartitionId = Math.max(...server.context.map.partitions.keys()) + 1;
        const partition = makeBareMap(args.width, args.height, args.depth || 1);
        partition.name = args.name;
        server.context.map.addPartition(nextPartitionId, partition);
        server.save().then(() => {
          partition.loaded = true;
          playerConnection.sendEvent(EventBuilder.chat({
            section: 'World',
            from: 'World',
            text: `Made partition ${nextPartitionId}`,
          }));
        });
      },
    },
    expandPartition: {
      args: [
        {name: 'coordinate', type: 'string'},
      ],
      do(args: { coordinate: string }) {
        if (!['x', 'y', 'z'].includes(args.coordinate)) {
          return 'must be one of: x y z';
        }

        const w = creature.pos.w;

        async function expand() {
          const partition = server.context.map.getPartition(w);

          // Need everything to be loaded.
          for (let sx = 0; sx < partition.sectors.length; sx++) {
            for (let sy = 0; sy < partition.sectors[sx].length; sy++) {
              for (let sz = 0; sz < partition.sectors[sx][sy].length; sz++) {
                await partition.getSectorAsync({x: sx, y: sy, z: sz});
              }
            }
          }

          let newWidth = partition.width;
          let newHeight = partition.height;
          let newDepth = partition.depth;
          if (args.coordinate === 'x') {
            newWidth += SECTOR_SIZE;
          } else if (args.coordinate === 'y') {
            newHeight += SECTOR_SIZE;
          } else if (args.coordinate === 'z') {
            newDepth += 1;
          }

          const oldSectors = partition.sectors;
          const newSectors = Utils.matrix<Sector | null>(newWidth / SECTOR_SIZE, newHeight / SECTOR_SIZE, newDepth);
          for (let sx = 0; sx < newSectors.length; sx++) {
            for (let sy = 0; sy < newSectors[sx].length; sy++) {
              for (let sz = 0; sz < newSectors[sx][sy].length; sz++) {
                const oldSector = oldSectors?.[sx]?.[sy]?.[sz];
                if (oldSector) {
                  newSectors[sx][sy][sz] = oldSector;
                } else {
                  const newSector = partition.createEmptySector();
                  newSectors[sx][sy][sz] = newSector;

                  function getFloor(x: number, y: number) {
                    if (args.coordinate === 'x') {
                      const sector = oldSectors[sx - 1][sy][sz];
                      if (!sector) throw new Error('unexpected error in getFloor');

                      return sector[SECTOR_SIZE - 1][y].floor;
                    } else if (args.coordinate === 'y') {
                      const sector = oldSectors[sx][sy - 1][sz];
                      if (!sector) throw new Error('unexpected error in getFloor');

                      return sector[x][SECTOR_SIZE - 1].floor;
                    } else {
                      return 0;
                    }
                  }

                  function getElevation(x: number, y: number) {
                    if (args.coordinate === 'x') {
                      const sector = oldSectors[sx - 1][sy][sz];
                      if (!sector) throw new Error('unexpected error in getElevation');

                      return sector[SECTOR_SIZE - 1][y].elevation;
                    } else if (args.coordinate === 'y') {
                      const sector = oldSectors[sx][sy - 1][sz];
                      if (!sector) throw new Error('unexpected error in getElevation');

                      return sector[x][SECTOR_SIZE - 1].elevation;
                    } else {
                      return 0;
                    }
                  }

                  // eslint-disable-next-line @typescript-eslint/prefer-for-of
                  for (let x = 0; x < SECTOR_SIZE; x++) {
                    // eslint-disable-next-line @typescript-eslint/prefer-for-of
                    for (let y = 0; y < SECTOR_SIZE; y++) {
                      newSector[x][y].floor = getFloor(x, y);
                      newSector[x][y].elevation = getElevation(x, y);
                    }
                  }
                }
              }
            }
          }

          partition.sectors = newSectors;
          partition.width = newWidth;
          partition.height = newHeight;
          partition.depth = newDepth;

          await server.context.save();

          // TODO: don't simply send it to everyone.
          server.broadcast(EventBuilder.initializePartition({
            name: partition.name,
            w,
            x: partition.width,
            y: partition.height,
            z: partition.depth,
          }));
        }

        // TODO: make commands async
        expand();
      },
    },
    advanceTime: {
      args: [
        {name: 'ticks', type: 'number'},
      ],
      help: `1 hour=${server.context.ticksPerWorldDay / 24}`,
      do(args: { ticks: number }) {
        server.advanceTime(args.ticks);
      },
    },
    xp: {
      args: [
        {name: 'skillName', type: 'string'},
        {name: 'xp', type: 'number'},
      ],
      do(args: { skillName: string; xp: number }) {
        const skill = Content.getSkillByName(args.skillName);
        if (!skill) {
          server.send(EventBuilder.chat({
            section: 'World',
            from: 'SERVER',
            text: `No skill named ${args.skillName}`,
          }), playerConnection);
          return;
        }

        server.grantXp(playerConnection, skill.id, args.xp);
      },
    },
    jewelry: {
      args: [],
      do() {
        const pos = {...playerConnection.creature.pos};

        const meta = Content.getRandomMetaItemOfClass('Jewelry');
        const item: Item = {
          type: meta.id,
          quantity: 1,
          buff: {
            id: '',
            expiresAt: 0,
            skill: 1,
            linearChange: 10,
          },
        };
        server.addItemNear(pos, item);
      },
    },
    setAdmin: {
      args: [
        {name: 'playerName', type: 'string'},
      ],
      do(args: { playerName: string }) {
        const playerId = server.context.playerNamesToIds.get(args.playerName);
        if (!playerId) return; // TODO
        const player = server.context.players.get(playerId);
        if (!player) return;

        player.isAdmin = true;
        // TODO: for now, player must refresh page to see Admin panel.
      },
    },
  };

  if (playerConnection.player.isAdmin) Object.assign(CHAT_COMMANDS, ADMIN_CHAT_COMMANDS);

  const parsedCommand = CommandParser.parseCommand(text.substring(1));
  const command = CHAT_COMMANDS[parsedCommand.commandName];
  if (!command) {
    server.send(EventBuilder.chat({
      section: 'World',
      from: 'SERVER',
      text: `unknown command: ${text}`,
    }), playerConnection);
    return Promise.reject();
  }

  const parsedArgs = CommandParser.parseArgs(parsedCommand.argsString, command.args);
  // TODO: return Error instead ?
  if ('error' in parsedArgs) {
    server.send(EventBuilder.chat({
      section: 'World',
      from: 'SERVER',
      text: `error: ${parsedArgs.error}`,
    }), playerConnection);
    return Promise.reject();
  }

  const maybeError = command.do(parsedArgs);
  if (maybeError) {
    server.send(EventBuilder.chat({
      section: 'World',
      from: 'SERVER',
      text: `error: ${maybeError}`,
    }), playerConnection);
  }
}
