import * as Helper from './helper.js';

interface GridiaWindowOptions {
  onInit: (el: HTMLElement) => void;
  id: string;
  cell: string;
  tabLabel?: string;
  noscroll?: boolean;
  show?: boolean;
  onShow?: () => void;
  onHide?: () => void;
}

export type WindowDelegate = ReturnType<WindowManager['createWindow']>;

export class WindowManager {
  private windows: Record<string, {el: HTMLElement; initialized: boolean} & GridiaWindowOptions> = {};

  hasWindow(id: string) {
    return Boolean(this.windows[id]);
  }

  createWindow(opts: GridiaWindowOptions) {
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

    return {
      id: opts.id,
      hide: () => this.hideWindow(opts.id),
      show: () => this.showWindow(opts.id),
      toggle: (force?: boolean) => {
        return force ?? el.classList.contains('hidden') ? this.showWindow(opts.id) : this.hideWindow(opts.id);
      },
      remove: () => this.removeWindow(opts.id),
      isOpen: () => !el.classList.contains('hidden'),
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

    if (win.onShow) win.onShow();
    win.el.classList.remove('hidden');
    if (win.tabLabel) {
      Helper.find(`.panels__tab[data-panel="${id}"]`).classList.toggle('panels__tab--active', true);
    }
  }

  hideWindow(id: string) {
    const win = this.windows[id];
    if (win.onHide) win.onHide();
    win.el.classList.add('hidden');
    if (win.tabLabel) {
      Helper.find(`.panels__tab[data-panel="${id}"]`).classList.toggle('panels__tab--active', false);
    }
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
}
