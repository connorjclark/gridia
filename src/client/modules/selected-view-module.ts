import * as Content from '../../content.js';
import {ItemLocation} from '../../utils.js';
import {ClientModule} from '../client-module.js';
import {makeViewWindow} from '../ui/view-window.js';

export class SelectedViewModule extends ClientModule {
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
      creature = game.client.context.getCreatureAt(location.pos);
    }

    if (creature) {
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

    if (game.client.attackingCreatureId) {
      state.selectedView.creatureId = game.client.attackingCreatureId;
      state.selectedView.location = undefined;
    }

    if (state.selectedView.creatureId) {
      creature = game.client.context.getCreature(state.selectedView.creatureId);
    }

    if (creature) {
      // tilePos = creature.pos;
      tile = game.client.context.map.getTile(creature.pos);
    } else if (state.selectedView.location?.source === 'world') {
      // tilePos = state.selectedView.location.pos;
      tile = game.client.context.map.getTile(state.selectedView.location.pos);
      item = tile?.item;
    } else if (state.selectedView.location?.source === 'container') {
      const container = game.client.context.containers.get(state.selectedView.location.id);
      if (container && state.selectedView.location.index !== undefined) {
        item = container.items[state.selectedView.location.index];
      }
    }

    let data: Record<string, string | { type: 'bar'; color: string; current: number; max: number }>;
    if (creature) {
      data = {
        'Name': creature.name,
        'Combat Level': String(creature.combatLevel),
        'Life': {type: 'bar', color: 'red', ...creature.life},
        'Stamina': {type: 'bar', color: 'yellow', ...creature.stamina},
        'Mana': {type: 'bar', color: 'blue', ...creature.mana},
        'Food': String(creature.food),
      };
    } else if (item) {
      const meta = Content.getMetaItem(item.type);
      data = {
        name: meta.name,
      };

      if (meta.food) data.food = String(meta.food);
      if (meta.foodLife) data.foodLife = String(meta.foodLife);
      if (meta.foodStamina) data.foodStamina = String(meta.foodStamina);
      if (meta.foodMana) data.foodMana = String(meta.foodMana);
      if (item.buff) {
        const modifiers = [];
        if (item.buff.linearChange) modifiers.push('+' + item.buff.linearChange);
        if (item.buff.percentChange) modifiers.push('+' + item.buff.percentChange + '%');
        const boosts = item.buff.skill ? Content.getSkill(item.buff.skill).name : item.buff.attribute || '?';
        data.buff = `${modifiers.join(', ')} ${boosts}`;
      }
      if (item.quantity !== 1) data.quantity = item.quantity.toLocaleString();
      data.burden = String(item.quantity * meta.burden);
      if (meta.damageLow !== undefined && meta.damageHigh !== undefined) {
        data.damage = `${meta.damageLow} - ${meta.damageHigh}`;
      }
      if (meta.attackSpeed !== undefined) {
        data['attack speed'] = String(meta.attackSpeed);
      }
      if (meta.armorLevel !== undefined) {
        data.armor = String(meta.armorLevel);
      }
      data.id = String(meta.id);
    } else {
      data = {
        name: '-',
        quantity: '0',
        burden: '0',
      };
    }

    // Don't allow actions on self.
    const isSelf = creature?.id === game.client.creatureId;
    if (isSelf) {
      state.selectedView.actions = [];
    } else {
      if (state.selectedView.location) {
        state.selectedView.actions = game.getActionsFor(state.selectedView.location);
      } else if (creature) {
        state.selectedView.actions = game.getActionsFor(ItemLocation.World(creature.pos));
      }
    }

    this.getViewWindow().actions.setView({selectedView: this.game.state.selectedView, data});
    this.getViewWindow().delegate.toggle(Boolean(creature || item));
  }
}
