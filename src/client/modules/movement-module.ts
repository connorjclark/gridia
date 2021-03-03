import * as Content from '../../content';
import { findPath } from '../../path-finding';
import * as ProtocolBuilder from '../../protocol/client-to-server-protocol-builder';
import * as Utils from '../../utils';
import ClientModule from '../client-module';
import { GameActionEvent } from '../event-emitter';
import Game from '../game';
import * as Helper from '../helper';
import KEYS from '../keys';
import { MINE } from '../../constants';
import WorldMapPartition from '../../world-map-partition';

const MOVEMENT_DURATION = 200;

class MovementModule extends ClientModule {
  protected followCreature?: Creature;
  protected pathToDestination?: PartitionPoint[];
  protected canMoveAgainAt = 0;
  protected movementDirection: Point2 | null = null;

  constructor(game: Game) {
    super(game);
    this.onAction = this.onAction.bind(this);
  }

  onStart() {
    this.game.client.eventEmitter.on('action', this.onAction);
    this.game.addActionCreator((location) => {
      if (location.source !== 'world') return;

      const creature = this.game.client.context.getCreatureAt(location.loc);
      if (creature) {
        return {
          type: 'follow',
          innerText: 'Follow',
          title: 'Follow',
        };
      }
    });
  }

  onTick(now: number) {
    const focusCreature = this.game.client.creature;
    const focusPos = this.game.getPlayerPosition();
    const w = focusPos.w;
    const partition = this.game.client.context.map.getPartition(w);

    if (!focusCreature) return;
    // if (this.game.client.context.map.width === 0) return;
    if (now < this.canMoveAgainAt) return;

    let dest: TilePoint = { ...focusCreature.pos };

    const keyInputDelta = { x: 0, y: 0, z: 0 };
    if (this.game.keys[KEYS.W]) {
      keyInputDelta.y -= 1;
    } else if (this.game.keys[KEYS.S]) {
      keyInputDelta.y += 1;
    }
    if (this.game.keys[KEYS.A]) {
      keyInputDelta.x -= 1;
    } else if (this.game.keys[KEYS.D]) {
      keyInputDelta.x += 1;
    }

    const lastInPath = this.pathToDestination && this.pathToDestination.length > 0
      ? this.pathToDestination[this.pathToDestination.length - 1]
      : null;
    if (lastInPath && !this.followCreature && lastInPath.z !== focusCreature.pos.z) {
      this.invalidateDestination();
    }

    if (this.followCreature &&
      (this.followCreature.pos.w !== focusPos.w || this.followCreature.pos.z !== focusPos.z)) {
      this.invalidateDestination();
    }

    // TODO: only re-calc if path is obstructed.
    let to;
    if (this.followCreature) {
      to = this.followCreature.pos;
    } else if (lastInPath) {
      // re-calc
      to = lastInPath;
    }
    if (to) {
      this.pathToDestination = findPath(this.game.client.context, partition, focusPos, to);
    }

    if (!Utils.equalPoints(keyInputDelta, { x: 0, y: 0, z: 0 })) {
      dest = { ...focusCreature.pos };
      dest.x += keyInputDelta.x;
      dest.y += keyInputDelta.y;
      this.invalidateDestination();
    } else if (this.pathToDestination) {
      dest = { w, ...this.pathToDestination.splice(0, 1)[0] };
    }

    if (dest && !Utils.equalPoints(dest, focusCreature.pos)) {
      const itemToMoveTo = this.game.client.context.map.getItem(dest);
      if (itemToMoveTo && Content.getMetaItem(itemToMoveTo.type).class === 'Container') {
        Helper.openContainer(dest);
      }

      let attemptToMine = false;
      if (itemToMoveTo && Content.getMetaItem(itemToMoveTo.type).id === MINE) {
        attemptToMine = true;
      }

      if (attemptToMine || this.game.client.context.walkable(dest)) {
        this.canMoveAgainAt = now + MOVEMENT_DURATION;
        this.movementDirection = {
          x: Utils.clamp(dest.x - focusPos.x, -1, 1),
          y: Utils.clamp(dest.y - focusPos.y, -1, 1),
        };
        // this.game.client.context.map.moveCreature(focusCreature, dest);
        this.game.client.connection.send(ProtocolBuilder.move(dest));
        this.game.client.eventEmitter.emit('playerMove', { from: focusCreature.pos, to: dest });
        delete this.game.state.mouse.tile;
      }
    }
  }

  onAction(e: GameActionEvent) {
    const type = e.action.type;
    const { location } = e;
    if (location.source !== 'world') return;

    if (type === 'move-here') {
      const focusPos = this.game.getPlayerPosition();
      const partition = this.game.client.context.map.getPartition(focusPos.w);

      this.pathToDestination = findPath(this.game.client.context, partition, focusPos, location.loc);
      this.followCreature = undefined;
    } else if (type === 'follow') {
      this.followCreature = e.creature;
      this.pathToDestination = undefined;
    }
  }

  protected invalidateDestination() {
    this.pathToDestination = undefined;
    this.followCreature = undefined;
  }
}

export default MovementModule;
