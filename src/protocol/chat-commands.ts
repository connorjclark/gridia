import {MAX_STACK, SECTOR_SIZE} from '../constants.js';
import * as Content from '../content.js';
import * as CommandParser from '../lib/command-parser.js';
import {makeBareMap} from '../mapgen.js';
import {ClientConnection, PlayerConnection} from '../server/client-connection.js';
import {Server} from '../server/server.js';
import * as Utils from '../utils.js';

import * as EventBuilder from './event-builder.js';

export function processChatCommand(server: Server, playerConnection: PlayerConnection, text: string) {
  const creature = playerConnection.creature;

  const CHAT_COMMANDS: Record<string, CommandParser.Command> = {
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

        server.warpCreature(playerConnection.creature, destination);
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

        const loc = server.findNearest(creature2.pos, 10, false, (_, l) => server.context.walkable(l));
        if (!loc) return;

        server.warpCreature(creature, loc);
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

        const loc = server.findNearest(playerConnection.creature.pos, 10, true,
          (_, l) => server.context.walkable(l));
        if (loc) {
          server.createCreature({type: template.id}, loc);
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

        const loc = server.findNearest(playerConnection.creature.pos, 10, true,
          (t) => !t.item);
        if (loc) {
          server.setItemInWorld(loc, {type: meta.id, quantity});
        }
      },
    },
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
    newPartition: {
      args: [],
      do() {
        const nextPartitionId = Math.max(...server.context.map.partitions.keys()) + 1;
        const partition = makeBareMap(100, 100, 1);
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
    advanceTime: {
      args: [
        {name: 'ticks', type: 'number'},
      ],
      help: `1 hour=${server.context.ticksPerWorldDay / 24}`,
      do(args: { ticks: number }) {
        server.advanceTime(args.ticks);
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
        const loc = {...playerConnection.creature.pos};
        loc.y -= 1;

        const item = server.context.map.getItem(loc);
        if (!item || !Content.getMetaItem(item.type).readable) return 'invalid item';

        item.textContent = args.content;
      },
    },
    jewelry: {
      args: [],
      do() {
        const loc = {...playerConnection.creature.pos};

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
        server.addItemNear(loc, item);
      },
    },
    debugTile: {
      args: [],
      do() {
        const loc = {...playerConnection.creature.pos};

        const tile = server.context.map.getTile(loc);
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
