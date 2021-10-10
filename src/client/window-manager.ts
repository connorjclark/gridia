import * as Helper from './helper.js';

interface GridiaWindowOptions {
  onInit: (el: HTMLElement) => void;
  id: string;
  cell: string;
  tabLabel?: string;
  noscroll?: boolean;
  show?: boolean;
  onShow?: (el: HTMLElement) => void;
  onHide?: (el: HTMLElement) => void;
}

export type WindowDelegate = ReturnType<WindowManager['createWindow']>;

export class WindowManager {
  private windows: Record<string, {el: HTMLElement; initialized: boolean} & GridiaWindowOptions> = {};

  hasWindow(id: string) {
    return Boolean(this.windows[id]);
  }

  createWindow(opts: GridiaWindowOptions) {
    if (this.isNarrowViewport()) {
      if (opts.id === 'map') {
        opts.cell = 'right';
      } else if (opts.id === 'attributes') {
        opts.cell = 'top';
      } else {
        opts.cell = 'left';
      }
    }

    const cellEl = Helper.find(`.ui .grid-container > .${opts.cell}`);
    const el = Helper.createChildOf(cellEl, 'div', `window window--${opts.id}`);
    el.classList.toggle('window--noscroll', Boolean(opts.noscroll));
    this.windows[opts.id] = {
      el,
      initialized: false,
      ...opts,
    };

    if (opts.tabLabel) {
      const tabsContainer = Helper.find('.panels__tabs');
      const tabEl = Helper.createChildOf(tabsContainer, 'div', 'panels__tab', {'data-panel': opts.id});
      tabEl.textContent = opts.tabLabel;
    }

    if (opts.show) {
      this.showWindow(opts.id);
    } else {
      el.classList.add('hidden');
    }

    if (!this.isNarrowViewport()) {
      if (opts.id === 'admin') {
        Helper.find('.ui .grid-container').append(el);
        el.style.gridColumn = '3 / 5';
        el.style.gridRow = '1 / 4';
        this.windows[opts.id].onShow = () => this.hideWindowsInCell('right');
      }
    }

    return {
      id: opts.id,
      hide: () => this.hideWindow(opts.id),
      show: () => this.showWindow(opts.id),
      toggle: (force?: boolean) => {
        return force ?? el.classList.contains('hidden') ? this.showWindow(opts.id) : this.hideWindow(opts.id);
      },
      remove: () => this.removeWindow(opts.id),
      isOpen: () => this.isWindowOpen(opts.id),
    };
  }

  hideWindowsInCell(cell: string) {
    for (const win of Object.values(this.windows)) {
      if (win.cell === cell) this.hideWindow(win.id);
    }
  }

  showWindow(id: string) {
    const win = this.windows[id];
    if (!win.initialized) {
      win.onInit(win.el);
      win.initialized = true;
    }

    // Only allow one window in the center.
    if (win.cell === 'center') {
      this.hideWindowsInCell(win.cell);
    }

    if (win.onShow) win.onShow(win.el);
    win.el.classList.remove('hidden');
    if (win.tabLabel) {
      Helper.find(`.panels__tab[data-panel="${id}"]`).classList.toggle('panels__tab--active', true);
    }

    if (this.isNarrowViewport()) {
      // Only show one tab at a time.
      for (const w of Object.values(this.windows)) {
        if (w.initialized && w.tabLabel && w.id !== id && w.id !== 'map') this.hideWindow(w.id);
      }
    }
  }

  hideWindow(id: string) {
    const win = this.windows[id];
    if (win.onHide) win.onHide(win.el);
    win.el.classList.add('hidden');
    if (win.tabLabel) {
      Helper.find(`.panels__tab[data-panel="${id}"]`).classList.toggle('panels__tab--active', false);
    }
  }

  isWindowOpen(id: string) {
    return !this.windows[id].el.classList.contains('hidden');
  }

  removeWindow(id: string) {
    const win = this.windows[id];
    this.hideWindow(id);
    win.el.remove();
    if (win.tabLabel) {
      Helper.find(`.panels__tab[data-panel="${id}"]`).remove();
    }
    delete this.windows[id];
  }

  isNarrowViewport() {
    return window.innerWidth < 1000;
  }

  getOpenWindows() {
    return Object.values(this.windows).filter((win) => this.isWindowOpen(win.id));
  }
}
