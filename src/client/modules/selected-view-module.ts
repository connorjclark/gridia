import * as Content from '../../content';
import ClientModule from '../client-module';
import * as Helper from '../helper';

class SelectedViewModule extends ClientModule {
  protected followCreature?: Creature;
  protected pathToDestination?: PartitionPoint[];
  protected canMoveAgainAt = 0;
  protected movementDirection: Point2 | null = null;
  protected movementFrom: Point4 | null = null;

  onStart() {
    // empty.
  }

  onTick() {
    // empty.
  }

  selectView(loc: TilePoint) {
    const game = this.game;
    const creature = game.client.context.map.getTile(loc).creature;
    if (creature && creature.id !== game.client.player.creature.id) {
      // TODO: change selectedView to {tile, loc}
      game.state.selectedView.creatureId = creature.id;
      game.state.selectedView.tile = undefined;
    } else {
      game.state.selectedView.tile = loc;
      game.state.selectedView.creatureId = undefined;
    }

    // TODO: decouple.
    game.modules.usage.updatePossibleUsages();
    this.renderSelectedView();
  }

  clearSelectedView() {
    this.game.state.selectedView.tile = undefined;
    this.game.state.selectedView.creatureId = undefined;
    this.renderSelectedView();
  }

  renderSelectedView() {
    const game = this.game;
    const state = game.state;

    let creature;
    if (state.selectedView.creatureId) creature = game.client.context.getCreature(state.selectedView.creatureId);

    let tilePos;
    if (creature) {
      tilePos = creature.pos;
    } else if (state.selectedView.tile) {
      tilePos = state.selectedView.tile;
    }
    const tile = tilePos && game.client.context.map.getTile(tilePos);
    const item = tile?.item;

    let data: Record<string, string>;
    let meta;
    if (creature) {
      data = {
        name: creature.name,
        life: String(creature.life),
        food: String(creature.food),
      };
    } else if (item) {
      meta = Content.getMetaItem(item.type);
      data = {
        name: meta.name,
        quantity: String(item.quantity),
        burden: String(item.quantity * meta.burden),
        misc: JSON.stringify(meta, null, 2),
      };
    } else {
      data = {
        name: '-',
        quantity: '0',
        burden: '0',
        misc: '',
      };
    }

    const el = Helper.find('.selected-view');
    const detailsEl = Helper.find('.selected-view--details', el);
    detailsEl.innerHTML = '';
    for (const [key, value] of Object.entries(data)) {
      const detailEl = document.createElement('div');
      detailEl.classList.add('.selected-view--detail', `.selected-view--detail-${key}`);
      detailEl.textContent = `${key[0].toUpperCase() + key.substr(1)}: ${value}`;
      detailsEl.appendChild(detailEl);
    }

    const actionsEl = Helper.find('.selected-view--actions', el);
    actionsEl.innerHTML = 'Actions:';

    if (!tilePos || !tile) return;

    // Clone tile so properties can be removed as needed.
    // Also prevents action creators from modifying important data.
    const clonedTile: Tile = JSON.parse(JSON.stringify(tile));

    if (clonedTile && clonedTile.creature && clonedTile.creature.id === game.client.player.creature.id) {
      // Don't allow actions on self.
      clonedTile.creature = undefined;
    } else if (creature) {
      // If a creature is selected, do not show actions for the item on the tile.
      clonedTile.item = undefined;
    }

    const actions = state.selectedView.actions = game.getActionsFor(clonedTile, tilePos);
    for (const action of actions) {
      const actionEl = document.createElement('button');
      this.game.addDataToActionEl(actionEl, {
        action,
        loc: game.state.selectedView.tile,
        creature,
      });
      actionsEl.appendChild(actionEl);
    }
  }
}

export default SelectedViewModule;
