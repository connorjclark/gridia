import * as Content from '../../content';
import { findPath } from '../../path-finding';
import { equalPoints } from '../../utils';
import ClientModule from '../client-module';
import Game from '../game';
import god from '../god';
import * as Helper from '../helper';
import KEYS from '../keys';

class MovementClientModule extends ClientModule {
  protected destination: TilePoint | null;
  protected pathToDestination: TilePoint[];
  protected lastMove: number = performance.now();

  // TODO Game type.
  constructor(game: Game) {
    super(game);
    this.onAction = this.onAction.bind(this);
  }

  public onStart() {
    this.game.client.eventEmitter.on('Action', this.onAction);
    this.game.addActionCreator((tile) => {
      if (tile.creature) {
        return {
          type: 'follow',
          innerText: 'Follow',
          title: 'Follow',
        };
      }
    });
  }

  public onTick() {
    const focusCreature = this.game.client.context.getCreature(this.game.client.creatureId);
    const focusPos = focusCreature ? focusCreature.pos : { x: 0, y: 0, z: 0 };
    const z = focusPos.z;

    if (!focusCreature) return;
    if (this.game.client.context.map.width === 0) return;

    if (focusCreature && performance.now() - this.lastMove > 200) {
      let dest: TilePoint = { ...focusCreature.pos };

      const keyInputDelta = {x: 0, y: 0, z: 0};
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

      if (this.destination && this.destination.z !== focusCreature.pos.z) {
        this.invalidateDestination();
      }

      if (!equalPoints(keyInputDelta, {x: 0, y: 0, z: 0})) {
        dest = { ...focusCreature.pos };
        dest.x += keyInputDelta.x;
        dest.y += keyInputDelta.y;
        this.invalidateDestination();
      } else if (this.destination) {
        dest = this.pathToDestination.splice(0, 1)[0];
      }

      if (dest && !equalPoints(dest, focusCreature.pos)) {
        const itemToMoveTo = this.game.client.context.map.getItem(dest);
        if (itemToMoveTo && Content.getMetaItem(itemToMoveTo.type).class === 'Container') {
          Helper.openContainer(dest);
        }

        if (this.game.client.context.map.walkable(dest)) {
          this.lastMove = performance.now();
          god.wire.send('move', dest);
          this.game.client.eventEmitter.emit('PlayerMove');
          if (this.destination && equalPoints(this.destination, dest)) {
            this.invalidateDestination();
          }

          delete god.state.mouse.tile;
        } else {
          // TODO - repath.
          this.invalidateDestination();
        }
      }
    }
  }

  public onAction(e: GameActionEvent) {
    const type = e.action.type;
    const {loc} = e;
    if (type !== 'move-here') return;

    // TODO this is repeated many places.
    const focusCreature = this.game.client.context.getCreature(this.game.client.creatureId);
    const focusPos = focusCreature ? focusCreature.pos : { x: 0, y: 0, z: 0 };

    this.pathToDestination = findPath(this.game.client.context.map, focusPos, loc);
    this.destination = loc;
  }

  protected invalidateDestination() {
    this.destination = null;
    this.pathToDestination = [];
  }
}

export default MovementClientModule;
