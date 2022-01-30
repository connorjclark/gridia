import {render, h} from 'preact';
import {useEffect, useState} from 'preact/hooks';

import * as Content from '../../../content.js';
import * as CommandBuilder from '../../../protocol/command-builder.js';
import {ItemLocation} from '../../../utils.js';
import {Game} from '../../game.js';
import {ItemGraphic} from '../components/graphic.js';
import {TabbedPane, TabbedPaneProps} from '../components/tabbed-pane.js';
import {c, ComponentProps, createSubApp, useContainerItems} from '../ui-common.js';

interface State {
  name?: string;
  buyingContainer: Container;
  sellingContainer?: Container;
}

export function makeStoreWindow(game: Game, buyingContainer: Container, name?: string) {
  const initialState: State = {
    name,
    buyingContainer,
    sellingContainer: game.client.inventory,
  };

  const actions = {

  };

  type Props = ComponentProps<State, typeof actions>;

  const StoreWindowPanel = (props: Props & { isBuying: boolean }) => {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [quantity, setQuantity] = useState(1);

    const container = props.isBuying ? props.buyingContainer : props.sellingContainer;
    if (!container) throw new Error();

    const items = useContainerItems(game, container);
    const selectedItem = selectedIndex !== null ? container.items[selectedIndex] : undefined;
    const selectedItemMeta = selectedItem ? Content.getMetaItem(selectedItem.type) : undefined;
    const price = quantity * (selectedItemMeta ? selectedItemMeta.value || 1 : 0);
    const buyOrSellText = props.isBuying ? 'Buy' : 'Sell';
    const buttonText = selectedItemMeta ?
      `${buyOrSellText} ${quantity} ${selectedItemMeta.name} for ${price} gold` :
      '-';

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
        {items.map((item, i) => {
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
              {meta.name} <span class="store-item__quantity">(x{item.quantity.toLocaleString()})</span>
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

          if (props.isBuying) {
            game.client.connection.sendCommand(CommandBuilder.buyItem({
              from: ItemLocation.Container(props.buyingContainer.id, selectedIndex),
              quantity,
              price,
            }));
          } else {
            if (!props.sellingContainer) throw new Error();

            game.client.connection.sendCommand(CommandBuilder.sellItem({
              from: ItemLocation.Container(props.sellingContainer.id, selectedIndex),
              to: ItemLocation.Container(props.buyingContainer.id),
              quantity,
              price,
            }));
          }
        }}>{buttonText}</button>
      </div>
    </div>;
  };

  const tabs: TabbedPaneProps['tabs'] = {
    buy: {
      label: 'Buy',
      content: (props: Props) => <StoreWindowPanel {...props} isBuying={true}></StoreWindowPanel>,
    },
  };

  if (initialState.sellingContainer) {
    tabs.sell = {
      label: 'Sell',
      content: (props: Props) => <StoreWindowPanel {...props} isBuying={false}></StoreWindowPanel>,
    };
  }

  const StoreWindow = (props: Props) => {
    return <div class="m1">
      <TabbedPane tabs={tabs} childProps={props}></TabbedPane>
    </div>;
  };

  const {SubApp, exportedActions, subscribe} = createSubApp(StoreWindow, initialState, actions);

  const delegate = game.windowManager.createWindow({
    id: `store${buyingContainer.id}`,
    cell: 'center',
    show: true,
    noscroll: true,
    onInit(el) {
      render(<SubApp />, el);
    },
  });

  return {delegate, actions: exportedActions, subscribe};
}
