import {render, h, Component} from 'preact';

import * as Content from '../../content.js';
import {UsageModule} from '../modules/usage-module.js';

import {Graphic} from './ui-common.js';

export function makeUsagesWindow(usageModule: UsageModule) {
  let setState = (_: Partial<State>) => {
    // Do nothing.
  };

  interface State {
    usages: ItemUse[];
  }
  class UsagesWindow extends Component {
    state: State = {usages: []};

    componentDidMount() {
      setState = this.setState.bind(this);
    }

    render(props: any, state: State) {
      return <div>
        <div>
          {'Usages'}
        </div>
        <div className="usages__usages">
          {state.usages.map((usage, i) => {
            if (usage.products.length === 0) return;

            const item = usage.products[0];
            const metaItem = Content.getMetaItem(item.type);
            return <div className="usages__usage" data-index={i}>
              <Graphic
                file={metaItem.graphics.file}
                index={metaItem.graphics.frames[0]}
                quantity={item.quantity}
                title={metaItem.name}
              ></Graphic>
            </div>;
          })}
        </div>
      </div>;
    }
  }

  const delegate = usageModule.game.windowManager.createWindow({
    id: 'usages',
    cell: 'center',
    onInit(el) {
      render(<UsagesWindow />, el);
      el.addEventListener('pointerup', (e) => {
        const index = getIndex(e);
        if (index === undefined) return;

        usageModule.selectUsage(index);
      });
    },
  });

  const getIndex = (e: PointerEvent): number | undefined => {
    const target = e.target as HTMLElement;
    const slotEl = target.closest('.usages__usage') as HTMLElement;
    if (!slotEl) return;

    const index = Number(slotEl.dataset.index);
    return index;
  };


  return {
    delegate,
    setState: (s: Partial<State>) => setState(s),
  };
}
