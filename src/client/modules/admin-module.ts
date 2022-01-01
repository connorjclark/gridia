import * as CommandBuilder from '../../protocol/command-builder.js';
import * as Utils from '../../utils.js';
import {ClientModule} from '../client-module.js';
import {KEYS} from '../keys.js';
import {makeAdminWindow, State} from '../ui/admin-window.js';

interface HistoryEntry {
  floors?: Array<{pos: Point4; from: number; to: number}>;
  items?: Array<{pos: Point4; from: Item|undefined; to: Item|undefined}>;
}

export class AdminModule extends ClientModule {
  window = makeAdminWindow(this);
  private _state?: State;
  private _history: HistoryEntry[] = [];
  private _historyIndex = 0;
  private _uncommitedHistoryEntry: HistoryEntry = {};

  onStart() {
    this.init();

    this.game.client.eventEmitter.on('event', (e) => {
      if (e.type === 'setFloor') {
        this.removeFromHistory(e.args, e.args.floor, 'floor');
      }
      if (e.type === 'setItem' && e.args.location.source === 'world') {
        this.removeFromHistory(e.args.location.pos, e.args.item?.type, 'item');
      }
    });
  }

  addToHistory(entry: HistoryEntry) {
    if (!entry.items?.length && !entry.floors?.length) return;

    if (this._historyIndex !== this._history.length - 1) {
      this._history = this._history.slice(0, this._historyIndex + 1);
    }
    this._history.push(entry);
    this._historyIndex = this._history.length - 1;
  }

  private init() {
    this.window.subscribe((state) => {
      if (state.selected) {
        this.game.client.eventEmitter.emit('editingMode', {enabled: true});
      } else {
        this.game.client.eventEmitter.emit('editingMode', {enabled: false});
      }

      this._state = state;
    });

    // const scripts = await this.game.client.connection.sendCommand(CommandBuilder.requestScripts({}));
    // console.log({scripts}); // TODO ?

    let downAt: Point4 | undefined;
    this.game.client.eventEmitter.on('pointerDown', (pos) => {
      if (!this.window.delegate.isOpen()) return;
      if (!this._state) return;

      this._uncommitedHistoryEntry = {};
      downAt = pos;
      if (this._state.tool === 'point') {
        this.setTile(pos, this._uncommitedHistoryEntry);
      }
    });
    this.game.client.eventEmitter.on('pointerMove', (pos) => {
      if (!this.window.delegate.isOpen()) return;
      if (!this._state || !this._state.selected || !downAt) return;

      if (this._state.tool === 'point') {
        this.setTile(pos, this._uncommitedHistoryEntry);
      }
    });
    this.game.client.eventEmitter.on('pointerUp', (pos) => {
      if (!this.window.delegate.isOpen()) return;

      if (!this.game.client.context.map.inBounds(pos)) {
        downAt = undefined;
        return;
      }

      if (downAt && this._state?.tool === 'rectangle') {
        const minx = Math.min(downAt.x, pos.x);
        const maxx = Math.max(downAt.x, pos.x);
        const miny = Math.min(downAt.y, pos.y);
        const maxy = Math.max(downAt.y, pos.y);
        for (let x = minx; x <= maxx; x++) {
          for (let y = miny; y <= maxy; y++) {
            this.setTile({x, y, w: pos.w, z: pos.z}, this._uncommitedHistoryEntry);
          }
        }
      }

      if (this._state?.tool === 'fill') {
        const start = this.game.client.context.map.getTile(pos);
        const seen = new Set<string>();
        const pending = new Set<string>();
        const locsToSet: Point4[] = [];
        const index = (l: Point4) => `${l.x},${l.y}`;
        const add = (l: Point4) => {
          const data = index(l);
          if (seen.has(data)) return;
          seen.add(data);

          if (!this.game.client.context.map.inBounds(l)) return;
          if (!this.game.worldContainer.camera.contains(l)) return;

          const tile = this.game.client.context.map.getTile(l);
          if (tile.item?.type !== start.item?.type) return;
          if (tile.floor !== start.floor) return;

          pending.add(data);
        };

        add(pos);
        while (pending.size) {
          for (const data of pending.values()) {
            pending.delete(data);
            const [x, y] = data.split(',').map(Number);
            const l = {...pos, x, y};
            locsToSet.push(l);

            add({...l, x: x + 1, y});
            add({...l, x: x - 1, y});
            add({...l, x, y: y + 1});
            add({...l, x, y: y - 1});
          }
        }

        for (const l of locsToSet) {
          this.setTile(l, this._uncommitedHistoryEntry);
        }
      }

      if (this._state?.tool) {
        this.addToHistory(this._uncommitedHistoryEntry);
        this._uncommitedHistoryEntry = {};
      }

      downAt = undefined;
    });

    const cmdKeys = [...KEYS.COMMAND, KEYS.CONTROL];
    document.addEventListener('keydown', (e) => {
      if (e.key === 'z') {
        if (!this.window.delegate.isOpen()) return;

        const cmdDown = cmdKeys.some((k) => this.game.keys[k]);
        const shiftDown = this.game.keys[KEYS.SHIFT];
        if (cmdDown && shiftDown) {
          this.redo();
        } else if (cmdDown) {
          this.undo();
        }
      }
    });
  }

  private setTile(pos: Point4, historyEntry: HistoryEntry) {
    if (!this.window.delegate.isOpen()) return;
    if (!this._state?.selected) return;

    if (this._state.selected.type === 'items') {
      const item = this._state.selected.id > 0 ? {type: this._state.selected.id, quantity: 1} : undefined;
      const currentItem = this.game.client.context.map.getItem(pos);
      if (Utils.equalItems(currentItem, item)) return;

      // Don't overwrite existing items - must explictly select the "null" item to delete items.
      if (this._state.safeMode && currentItem && item) return;

      this.game.client.connection.sendCommand(CommandBuilder.adminSetItem({
        ...pos,
        item,
      }));

      historyEntry.items = historyEntry.items || [];
      historyEntry.items.push({
        pos,
        from: currentItem,
        to: item,
      });

      // Set immeditely in client, b/c server will take a while to respond and this prevents sending multiple
      // messages for the same tile.
      // TODO: seems like a bad idea.
      this.game.client.context.map.getTile(pos).item = item;
    } else if (this._state.selected.type === 'floors') {
      const currentFloor = this.game.client.context.map.getTile(pos).floor;
      const floor = this._state.selected.id;
      if (currentFloor === floor) return;
      this.game.client.connection.sendCommand(CommandBuilder.adminSetFloor({
        ...pos,
        floor,
      }));

      historyEntry.floors = historyEntry.floors || [];
      historyEntry.floors.push({
        pos,
        from: currentFloor,
        to: floor,
      });

      this.game.client.context.map.getTile(pos).floor = floor;
    }
  }

  private removeFromHistory(pos: Point4, id: number | undefined, type: 'floor' | 'item') {
    function handleEntry(entry: HistoryEntry) {
      if (type === 'floor' && entry.floors) {
        const index = entry.floors.findIndex((f) => Utils.equalPoints(pos, f.pos) && f.to !== id);
        if (index !== -1) entry.floors.splice(index, 1);
      }
      if (type === 'item' && entry.items) {
        const index = entry.items.findIndex((i) => Utils.equalPoints(pos, i.pos) && i.to?.type !== id);
        if (index !== -1) entry.items.splice(index, 1);
      }
    }

    // TODO: this doesn't work because don't know how to differntiate setItem/setFloor updates caused by redo/undo
    // for (const entry of this._history) {
    //   handleEntry(entry);
    // }
    // handleEntry(this._uncommitedHistoryEntry);
  }

  undo() {
    const entry = this._history[this._historyIndex];
    if (!entry) return;

    for (const item of entry.items || []) {
      this.game.client.connection.sendCommand(CommandBuilder.adminSetItem({
        ...item.pos,
        item: item.from,
      }));
    }

    for (const floor of entry.floors || []) {
      this.game.client.connection.sendCommand(CommandBuilder.adminSetFloor({
        ...floor.pos,
        floor: floor.from,
      }));
    }

    this._historyIndex = Utils.clamp(this._historyIndex - 1, 0, this._history.length - 1);
  }

  redo() {
    const entry = this._history[this._historyIndex];
    if (!entry) return;

    for (const item of entry.items || []) {
      this.game.client.connection.sendCommand(CommandBuilder.adminSetItem({
        ...item.pos,
        item: item.to,
      }));
    }

    for (const floor of entry.floors || []) {
      this.game.client.connection.sendCommand(CommandBuilder.adminSetFloor({
        ...floor.pos,
        floor: floor.to,
      }));
    }

    this._historyIndex = Utils.clamp(this._historyIndex + 1, 0, this._history.length - 1);
  }
}
