import { render, h, Component } from 'preact';
import { GFX_SIZE } from '../../constants';
import * as Content from '../../content';
import * as Draw from '../draw';
import * as Helper from '../helper';
import UsageModule from '../modules/usage-module';
import { Graphic } from './ui-common';

// omg
let possibleUsagesGrouped: PossibleUsage[][] = [];

export function makePossibleUsagesWindow(usageModule: UsageModule) {
  let setState = (_: Partial<State>) => {
    // Do nothing.
  };

  interface State {
    possibleUsages: PossibleUsage[];
  }
  class PossibleUsagesWindow extends Component {
    state: State = { possibleUsages: [] };

    componentDidMount() {
      setState = this.setState.bind(this);
    }

    render(props: any, state: State) {
      // Group by usage.
      const possibleUsagesGroupedMap = new Map<ItemUse, PossibleUsage[]>();
      for (const possibleUsage of state.possibleUsages) {
        const group = possibleUsagesGroupedMap.get(possibleUsage.use) || [];
        group.push(possibleUsage);
        possibleUsagesGroupedMap.set(possibleUsage.use, group);
      }
      possibleUsagesGrouped = [...possibleUsagesGroupedMap.values()];

      const entries = [];
      for (const possibleUsagesGroup of possibleUsagesGrouped) {
        const possibleUsage = possibleUsagesGroup[0];
        const products = possibleUsage.use.products.filter((p) => p.type);
        if (possibleUsage.use.successTool) products.unshift({ type: possibleUsage.use.successTool, quantity: 1 });
        entries.push(products);
      }

      const selectedTool = Helper.getSelectedTool();
      let title = 'Possible Usages';
      if (selectedTool) title += ` (using ${Content.getMetaItem(selectedTool.type).name})`;

      return <div>
        <div>
          {title}
        </div>
        <div class="possible-usages__usages">
          {entries.map((products, i) => {
            if (products.length === 0) return;

            return <div class="possible-usages__usage" data-index={i}>
              {products.map((product) => {
                const metaItem = Content.getMetaItem(product.type);
                // TODO this is silly.
                const graphicIndex = metaItem.animations ? (metaItem.animations[0] || 0) : 0;

                return <Graphic
                  type={'item'}
                  index={graphicIndex}
                  quantity={product.quantity}
                ></Graphic>;
              })}
            </div>;
          })}
        </div>
      </div>;
    }
  }

  const el = usageModule.game.makeUIWindow({ name: 'possible-usages', cell: 'left' });
  render(<PossibleUsagesWindow />, el);

  const getIndex = (e: PointerEvent): number | undefined => {
    const target = e.target as HTMLElement;
    const slotEl = target.closest('.possible-usages__usage') as HTMLElement;
    if (!slotEl) return;

    const index = Number(slotEl.dataset.index);
    return index;
  };

  el.addEventListener('pointerup', (e) => {
    const index = getIndex(e);
    if (index === undefined) return;

    // TODO: Choose which possible usage, somehow.
    usageModule.selectPossibleUsage(possibleUsagesGrouped[index][0]);
  });

  el.addEventListener('pointerover', (e) => {
    const index = getIndex(e);
    if (index === undefined) {
      usageModule.possibleUsageHighlight.location = null;
      return;
    }

    // Highlight the usage focus (the first one...) that would be used.
    const possibleUsage = possibleUsagesGrouped[index][0];
    usageModule.possibleUsageHighlight.location = possibleUsage.focusLocation;
  });
  el.addEventListener('pointerleave', () => {
    usageModule.possibleUsageHighlight.location = null;
  });

  return {
    el,
    setState: (s: Partial<State>) => setState(s),
  };
}
