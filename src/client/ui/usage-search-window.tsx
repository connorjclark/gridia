import linkState from 'linkstate';
import {render, h, Component} from 'preact';

import * as Content from '../../content.js';
import {Game} from '../game.js';

import {Input, ItemGraphic, PaginatedContent} from './ui-common.js';

export interface State {
  text: string;
  skillId?: number;
}
const DEFAULT_STATE: State = {
  text: '',
};

function renderItemUsages(usages: ItemUse[]) {
  return <div class="item-usages-search grid">
    <div class="item-usages-search__header grid-contents">
      <div>Tool</div>
      <div>Focus</div>
      <div>Products</div>
      <div>Skill</div>
    </div>
    {usages.map((usage) => {
      const textParts = [];
      if (usage.tool === -1) {
        textParts.push('anything');
      } else if (usage.tool === 0) {
        textParts.push('hand');
      } else {
        textParts.push(Content.getMetaItem(usage.tool).name);
      }
      textParts.push('+');
      textParts.push(usage.focus === 0 ? '' : Content.getMetaItem(usage.focus).name);
      textParts.push('=');
      textParts.push(usage.products
        .filter((p) => p.type !== 0)
        .map((p) => Content.getMetaItem(p.type).name)
        .join(', ')
      );

      return <div class="grid-contents">
        <div class="possible-usages__usage__tool">
          <ItemGraphic item={{type: usage.tool, quantity: usage.toolQuantityConsumed}}></ItemGraphic>
        </div>
        <div class="possible-usages__usage__focus">
          <ItemGraphic item={{type: usage.focus, quantity: usage.focusQuantityConsumed}}></ItemGraphic>
        </div>
        <div class="possible-usages__usage__products">
          {usage.products.map((product) => <ItemGraphic item={product}></ItemGraphic>)}
        </div>
        <div class="pd-5">
          {usage.skillId ?
            `${Content.getSkill(usage.skillId).name} ${usage.minimumSkillLevel}–${usage.maximumSkillLevel}` :
            null}
        </div>
        <div class="item-usages-search__text">{textParts.join(' ')}</div>
      </div>;
    })}
  </div>;
}

export function makeUsageSearchWindow(game: Game) {
  class UsageSearchWindow extends Component<any, State> {
    state = DEFAULT_STATE;

    render(props: any, state: State) {
      let usages = [...Content.getAllItemUses()];

      if (state.text) {
        const regex = new RegExp(state.text, 'i');
        usages = usages.filter((usage) => {
          if (Content.getMetaItem(usage.tool).name.match(regex)) return true;
          if (Content.getMetaItem(usage.focus).name.match(regex)) return true;
          for (const product of usage.products) {
            if (Content.getMetaItem(product.type).name.match(regex)) return true;
          }
          if (usage.skillId && Content.getSkill(usage.skillId).name.match(regex)) return true;

          return false;
        });
      }

      usages.sort((a, b) => {
        if (a.skillId === undefined || a.skillId !== b.skillId) return 0;
        return (a.minimumSkillLevel || 0) - (b.minimumSkillLevel || 0);
      });

      return <div class="usage-search">
        <div>
          <Input
            name="textFilter"
            type={'text'}
            onInput={linkState(this, 'text')}
            value={state.text}>
            Filter
          </Input>
        </div>

        <PaginatedContent
          itemsPerPage={10}
          items={usages}
          renderItems={renderItemUsages}></PaginatedContent>
      </div>;
    }
  }

  game.windowManager.createWindow({
    id: 'usage-search',
    cell: 'center',
    tabLabel: 'Usages',
    onInit(el) {
      render(<UsageSearchWindow />, el);
    },
  });
}
