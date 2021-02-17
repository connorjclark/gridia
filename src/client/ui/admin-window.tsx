import { render, h, Component, Fragment } from 'preact';
import linkState from 'linkstate';
import * as Content from '../../content';
import * as Helper from '../helper';
import * as Utils from '../../utils';
import AdminModule from '../modules/admin-module';

function tryRegex(value: string, flags = '') {
  try {
    return new RegExp(value, flags);
  } catch (_) {
    return;
  }
}

export function makeWindow(adminModule: AdminModule): HTMLElement {
  const classToMetaItem = new Map<string, MetaItem[]>();
  for (const metaItem of Content.getMetaItems()) {
    const itemClass = metaItem.class || 'None';
    const metaItems = classToMetaItem.get(itemClass) || [];
    metaItems.push(metaItem);
    classToMetaItem.set(itemClass, metaItems);
  }

  const itemClassesOrdered = Helper.sortByPrecedence([...classToMetaItem.keys()], [
    { type: 'equal', value: 'Normal' },
    { type: 'equal', value: 'None' },
  ]);

  const itemFilters: Array<{ type: string; value: string }> = [];
  for (const itemClass of itemClassesOrdered) {
    itemFilters.push({ type: 'class', value: itemClass });
  }

  const Input = (props: any) => {
    return <Fragment>
      <label>{props.children || props.name}</label>
      <input {...props}></input>
      {props.type === 'range' && props.value}
    </Fragment>;
  };

  const Selections = (props: { metaItems: MetaItem[] }) => {
    return <div class="ui-admin--selections">
      {props.metaItems.map((metaItem) => {
        const animation = metaItem.animations?.[0] || 0;
        const spritesheetId = Math.floor(animation / 100);
        const x = animation % 10;
        const y = Math.floor(animation / 10) % 100;

        return <div
          class="ui-admin--selection"
          title={metaItem.name}
          style={{
            backgroundImage: `url(world/items/items${spritesheetId}.png)`,
            backgroundPosition: `-${x * 32}px -${y * 32}px`,
            width: '32px',
            maxWidth: '32px',
            height: '32px',
          }}
          onClick={() => adminModule.setSelectedContent({ type: 'items', id: metaItem.id })}
        ></div>;
      })}
    </div>;
  };

  interface State {
    selectionFilter: {
      itemClass: string;
      text: string;
      page: number;
    };
    selected: number;
  }
  const DEFAULT_STATE: State = {
    selectionFilter: {
      itemClass: '',
      text: '',
      page: 0,
    },
    selected: -1,
  };

  function filterMetaItems(itemClass: string, text: string) {
    let metaItems = classToMetaItem.get(itemClass) || Content.getMetaItems();
    const regex = text && tryRegex(text, 'i');
    if (regex) {
      metaItems = metaItems.filter((item) => item.name.match(regex));
    }
    return metaItems;
  }

  class AdminWindow extends Component<any, State> {
    state = DEFAULT_STATE;

    render(props: any, state: State) {
      const FilterMenuItems = itemFilters.map((filter) => {
        if (filter.type === 'class') {
          const metaItems = filterMetaItems(filter.value, state.selectionFilter.text);
          const classes = [
            'ui-admin--filter',
          ];
          const nonEmpty = metaItems.length > 0;
          const enabled = nonEmpty &&
            (!state.selectionFilter.itemClass || state.selectionFilter.itemClass === filter.value);
          if (!enabled) classes.push('ui-admin--empty');
          return <div class={classes.join(' ')} onClick={() => nonEmpty && this.setItemClassFilter(filter.value)}>
            {filter.value} - {metaItems.length}
          </div>;
        }
      });

      const itemsPerPage = 300;
      const filteredItems = filterMetaItems(state.selectionFilter.itemClass, state.selectionFilter.text);
      const numPages = Math.ceil(filteredItems.length / itemsPerPage);
      const startIndex = itemsPerPage * state.selectionFilter.page;
      const paginatedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

      return <div class="ui-admin">
        <div>
          {FilterMenuItems}
        </div>
        <div>
          <Input
            name="textFilter"
            type={'text'}
            onInput={linkState(this, 'selectionFilter.text')}
            value={state.selectionFilter.text}>
            Name Filter
          </Input>
          <div>
            <button onClick={() => this.changePage(-1, numPages)}>{'<'}</button>
            <button onClick={() => this.changePage(1, numPages)}>{'>'}</button>
            page {state.selectionFilter.page + 1} of {numPages}
            <Selections metaItems={paginatedItems}></Selections>
          </div>
        </div>
      </div>;
    }

    changePage(delta: number, numPages: number) {
      const newPage = Utils.clamp(this.state.selectionFilter.page + delta, 0, numPages - 1);
      this.setState({ ...this.state, selectionFilter: { ...this.state.selectionFilter, page: newPage } });
    }

    setItemClassFilter(itemClass: string) {
      const isSame = itemClass === this.state.selectionFilter.itemClass;
      const newValue = isSame ? '' : itemClass;
      this.setState({ ...this.state, selectionFilter: { ...this.state.selectionFilter, itemClass: newValue } });
    }
  }

  const el = adminModule.game.makeUIWindow();
  render(<AdminWindow />, el);
  return el;
}
