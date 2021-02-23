import * as Content from '../../content';
import ClientModule from '../client-module';
import { makeViewWindow } from '../ui/view-window';
import { ItemLocation } from '../../utils';

class SelectedViewModule extends ClientModule {
  private viewWindow?: ReturnType<typeof makeViewWindow>;

  getViewWindow() {
    if (this.viewWindow) return this.viewWindow;
    this.viewWindow = makeViewWindow(this);
    return this.viewWindow;
  }

  onStart() {
    // empty.
  }

  onTick() {
    // empty.
  }

  selectView(location?: ItemLocation) {
    const game = this.game;
    let creature;
    if (location?.source === 'world') {
      creature = game.client.context.map.getTile(location.loc).creature;
    }

    if (creature && creature.id !== game.client.player.creature.id) {
      game.state.selectedView.creatureId = creature.id;
      game.state.selectedView.location = undefined;
    } else {
      game.state.selectedView.location = location;
      game.state.selectedView.creatureId = undefined;
    }

    // TODO: decouple.
    game.modules.usage.updatePossibleUsages();
    this.renderSelectedView();
  }

  clearSelectedView() {
    this.game.state.selectedView.location = undefined;
    this.game.state.selectedView.creatureId = undefined;
    this.renderSelectedView();
  }

  renderSelectedView() {
    const game = this.game;
    const state = game.state;

    let creature;
    let tile;
    // let tilePos;
    let item;

    if (state.selectedView.creatureId) {
      creature = game.client.context.getCreature(state.selectedView.creatureId);
    }

    if (creature) {
      // tilePos = creature.pos;
      tile = game.client.context.map.getTile(creature.pos);
    } else if (state.selectedView.location?.source === 'world') {
      // tilePos = state.selectedView.location.loc;
      tile = game.client.context.map.getTile(state.selectedView.location.loc);
      item = tile?.item;
    } else if (state.selectedView.location?.source === 'container') {
      const container = game.client.context.containers.get(state.selectedView.location.id);
      if (container && state.selectedView.location.index !== undefined) {
        item = container.items[state.selectedView.location.index];
      }
    }

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
        id: String(meta.id),
      };
    } else {
      data = {
        name: '-',
        quantity: '0',
        burden: '0',
      };
    }

    // Don't allow actions on self.
    const isSelf = tile?.creature?.id === game.client.player.creature.id;
    if (!isSelf) {
      if (state.selectedView.location) {
        state.selectedView.actions = game.getActionsFor(state.selectedView.location);
      } else if (creature) {
        state.selectedView.actions = game.getActionsFor(ItemLocation.World(creature.pos));
      }
    }

    this.getViewWindow().setState({ selectedView: this.game.state.selectedView, data });
    this.getViewWindow().el.hidden = !creature && !item;
  }
}

export default SelectedViewModule;
