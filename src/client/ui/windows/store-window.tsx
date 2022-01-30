import {render, h} from 'preact';
import {useEffect, useState} from 'preact/hooks';

import * as Content from '../../../content.js';
import * as CommandBuilder from '../../../protocol/command-builder.js';
import {ItemLocation} from '../../../utils.js';
import {Game} from '../../game.js';
import {ItemGraphic} from '../components/graphic.js';
import {c, ComponentProps, createSubApp} from '../ui-common.js';

interface State {
  name?: string;
  container: Container;
  selectedIndex: number | null;
}

const getIndex = (e: PointerEvent): number | undefined => {
  const target = e.target as HTMLElement;
  const slotEl = target.closest('.container__slot') as HTMLElement;
  if (!slotEl) return;

  const index = Number(slotEl.dataset.index);
  return index;
};

export function makeStoreWindow(game: Game, container: Container, name?: string) {
  const initialState: State = {
    name,
    container,
    selectedIndex: null,
  };

  const actions = {

  };

  type Props = ComponentProps<State, typeof actions>;
  const StoreWindow = (props: Props) => {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [quantity, setQuantity] = useState(1);

    const selectedItem = selectedIndex !== null ? props.container.items[selectedIndex] : undefined;
    const selectedItemMeta = selectedItem ? Content.getMetaItem(selectedItem.type) : undefined;
    const price = quantity * (selectedItemMeta ? selectedItemMeta.value || 1 : 0);
    const buyText = selectedItemMeta ? `Buy ${quantity} ${selectedItemMeta.name} for ${price} gold` : '-';

    const goldItemType = Content.getMetaItemByName('Gold').id;

    useEffect(() => {
      if (!selectedItem) {
        setQuantity(1);
        return;
      }

      setQuantity(Math.min(quantity, selectedItem.quantity));
    }, [selectedItem]);

    return <div class="m1">
      <div>
        {props.name || 'Store'}
      </div>

      <div class="store-items">
        {props.container.items.map((item, i) => {
          if (!item) return;

          const meta = Content.getMetaItem(item.type);
          return <div
            class={c('store-item', i === selectedIndex && 'store-item--selected')}
            onClick={() => setSelectedIndex(i)}
          >
            <div class="store-item__gfx">
              <ItemGraphic item={{type: item.type, quantity: 1}}></ItemGraphic>
            </div>
            <div class="store-item__label">
              {meta.name} <span class="store-item__quantity">(x{item.quantity})</span>
            </div>
            <div class="store-item__price flex align-bottom">
              <div class="store-item__price__leftborder"></div>
              <div class="store-item__price__inner flex align-items-center">
                <ItemGraphic item={{type: goldItemType, quantity: 1}} scale={0.75}></ItemGraphic>x
                <span style={{marginLeft: 'auto'}}>{meta.value || 1}</span>
              </div>
            </div>
          </div>;
        })}
      </div>

      <div class="flex flex-column">
        <label>
          <input type="number"
            value={quantity} min={1} max={selectedItem?.quantity || 1}
            onChange={(e: any) => setQuantity(e.target.valueAsNumber)}
          ></input>
        </label>

        <button disabled={!selectedItem} onClick={() => {
          if (selectedIndex === null) return;

          game.client.connection.sendCommand(CommandBuilder.buyItem({
            from: ItemLocation.Container(props.container.id, selectedIndex),
            quantity,
          }));
        }}>{buyText}</button>
      </div>
    </div>;
  };

  const {SubApp, exportedActions, subscribe} = createSubApp(StoreWindow, initialState, actions);

  const delegate = game.windowManager.createWindow({
    id: `store${container.id}`,
    cell: 'center',
    show: true,
    noscroll: true,
    onInit(el) {
      render(<SubApp />, el);
    },
  });

  return {delegate, actions: exportedActions, subscribe};
}
