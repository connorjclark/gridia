import {render, h} from 'preact';

import * as Content from '../../../content.js';
import * as Utils from '../../../utils.js';
import {UsageModule} from '../../modules/usage-module.js';
import {ItemGraphic} from '../components/graphic.js';
import {ComponentProps, createSubApp} from '../ui-common.js';

interface State {
  possibleUsages: PossibleUsage[];
  selectedTool?: Item;
}

// omg
let possibleUsagesGrouped: PossibleUsage[][] = [];

const getIndex = (e: PointerEvent): number | undefined => {
  const target = e.target as HTMLElement;
  const slotEl = target.closest('.possible-usages__usage') as HTMLElement;
  if (!slotEl) return;

  const index = Number(slotEl.dataset.index);
  return index;
};

export function makePossibleUsagesWindow(usageModule: UsageModule) {
  const initialState: State = {
    possibleUsages: [],
  };

  const actions = {
    setPossibleUsages: (state: State, possibleUsages: PossibleUsage[]): State => {
      if (state.possibleUsages.length === possibleUsages.length) {
        const allSame = possibleUsages.every((use1, i) => {
          const use2 = state.possibleUsages[i];
          return use1.use === use2.use && use1.toolIndex === use2.toolIndex
            && use1.usageIndex === use2.usageIndex && Utils.ItemLocation.Equal(use1.focusLocation, use2.focusLocation);
        });
        if (allSame) return state;
      }

      return {
        ...state, possibleUsages,
      };
    },
    setSelectedTool: (state: State, selectedTool: Item | undefined): State => ({...state, selectedTool}),
  };

  type Props = ComponentProps<State, typeof actions>;
  const PossibleUsagesWindow = (props: Props) => {
    // Group by usage.
    const possibleUsagesGroupedMap = new Map<ItemUse, PossibleUsage[]>();
    for (const possibleUsage of props.possibleUsages) {
      const group = possibleUsagesGroupedMap.get(possibleUsage.use) || [];
      group.push(possibleUsage);
      possibleUsagesGroupedMap.set(possibleUsage.use, group);
    }
    possibleUsagesGrouped = [...possibleUsagesGroupedMap.values()];

    const entries = [];
    for (const possibleUsagesGroup of possibleUsagesGrouped) {
      const possibleUsage = possibleUsagesGroup[0];
      const products = possibleUsage.use.products.filter((p) => p.type);
      if (possibleUsage.use.successTool) products.unshift({type: possibleUsage.use.successTool, quantity: 1});
      entries.push({
        tool: {
          type: possibleUsage.use.tool,
          quantity: possibleUsage.use.toolQuantityConsumed,
        },
        focus: {
          type: possibleUsage.use.focus,
          quantity: possibleUsage.use.focusQuantityConsumed,
        },
        products,
      });
    }

    let title = 'Possible Usages';
    if (props.selectedTool) title += ` (using ${Content.getMetaItem(props.selectedTool.type).name})`;

    const onPointerUp = (e: PointerEvent) => {
      const index = getIndex(e);
      if (index === undefined) return;

      // TODO: Choose which possible usage, somehow.
      usageModule.selectPossibleUsage(possibleUsagesGrouped[index][0]);
    };
    const onPointerOver = (e: PointerEvent) => {
      const index = getIndex(e);
      if (index === undefined) {
        usageModule.possibleUsageCursor.location = null;
        return;
      }

      // Highlight the usage focus (the first one...) that would be used.
      const possibleUsage = possibleUsagesGrouped[index][0];
      usageModule.possibleUsageCursor.location = possibleUsage.focusLocation;
    };
    const onPointerLeave = () => {
      usageModule.possibleUsageCursor.location = null;
    };

    return <div onPointerUp={onPointerUp} onPointerOver={onPointerOver} onPointerLeave={onPointerLeave}>
      <div>
        {title}
      </div>
      <div class="possible-usages__usages">
        {entries.map(({tool, focus, products}, i) => {
          return <div class="possible-usages__usage" data-index={i}>
            <div class="possible-usages__usage__tool">
              <ItemGraphic item={tool} showLabel={true}></ItemGraphic>
            </div>
            <div class="possible-usages__usage__focus">
              <ItemGraphic item={focus} showLabel={true}></ItemGraphic>
            </div>
            <div class="possible-usages__usage__products">
              {products.map((product) => <ItemGraphic item={product} showLabel={true}></ItemGraphic>)}
            </div>
          </div>;
        })}
      </div>
    </div>;
  };

  const {SubApp, exportedActions, subscribe} = createSubApp(PossibleUsagesWindow, initialState, actions);
  const delegate = usageModule.game.windowManager.createWindow({
    id: 'possible-usages',
    cell: 'left',
    onInit(el) {
      render(<SubApp />, el);
    },
  });

  return {delegate, actions: exportedActions, subscribe};
}
