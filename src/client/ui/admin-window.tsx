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

export function makeAdminWindow(adminModule: AdminModule): HTMLElement {
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

  const selectionFilters: Array<{ type: string; value: string }> = [];
  selectionFilters.push({ type: 'floors', value: 'Floors' });
  for (const itemClass of itemClassesOrdered) {
    selectionFilters.push({ type: 'class', value: itemClass });
  }

  const Input = (props: any) => {
    return <Fragment>
      <label>{props.children || props.name}</label>
      <input {...props}></input>
      {props.type === 'range' && props.value}
    </Fragment>;
  };

  interface SelectionProps {
    id: number;
    type: 'items' | 'floors';
    backgroundImage: string;
    x: number;
    y: number;
    title: string;
  }
  const Selection = (props: SelectionProps) => {
    return <div
      class="ui-admin--selection"
      title={props.title}
      style={{
        backgroundImage: props.backgroundImage,
        backgroundPosition: `-${props.x}px -${props.y}px`,
        width: '32px',
        maxWidth: '32px',
        height: '32px',
      }}
      onClick={() => adminModule.setSelectedContent({ type: props.type, id: props.id })}
    ></div>;
  };

  const ItemSelections = (props: { metaItems: MetaItem[] }) => {
    return <div class="ui-admin--selections">
      {props.metaItems.map((metaItem) => {
        const animation = metaItem.animations?.[0] || 0;
        const spritesheetId = Math.floor(animation / 100);
        const x = animation % 10;
        const y = Math.floor(animation / 10) % 100;

        return <Selection
          backgroundImage={`url(world/items/items${spritesheetId}.png)`}
          title={metaItem.name}
          x={x * 32}
          y={y * 32}
          id={metaItem.id}
          type={'items'}
        ></Selection>;
      })}
    </div>;
  };

  const FloorSelections = (props: { floors: MetaFloor[] }) => {
    return <div class="ui-admin--selections">
      {props.floors.map((floor) => {
        const animation = floor.id;
        const spritesheetId = Math.floor(animation / 100);
        const x = animation % 10;
        const y = Math.floor(animation / 10) % 100;

        return <Selection
          backgroundImage={`url(world/floors/floors${spritesheetId}.png)`}
          title={'Floor'}
          x={x * 32}
          y={y * 32}
          id={floor.id}
          type={'floors'}
        ></Selection>;
      })}
    </div>;
  };

  interface State {
    selectionFilter: {
      itemClass: string;
      text: string;
      page: number;
    };
    // selected: number; // TODO
  }
  const DEFAULT_STATE: State = {
    selectionFilter: {
      itemClass: '',
      text: '',
      page: 0,
    },
    // selected: -1,
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
      const FilterMenuItems = selectionFilters.map((filter) => {
        let length = 0;
        if (filter.type === 'floors') {
          length = Content.getFloors().length;
        } else {
          const metaItems = filterMetaItems(filter.value, state.selectionFilter.text);
          length = metaItems.length;
        }

        const classes = [
          'ui-admin--filter',
        ];
        const nonEmpty = length > 0;
        const enabled = nonEmpty &&
          (!state.selectionFilter.itemClass || state.selectionFilter.itemClass === filter.value) &&
          (filter.value !== 'Floors' || state.selectionFilter.itemClass === 'Floors');
        if (!enabled) classes.push('ui-admin--empty');
        return <div class={classes.join(' ')} onClick={() => nonEmpty && this.setItemClassFilter(filter.value)}>
          {filter.value} - {length}
        </div>;
      });

      const isFloors = state.selectionFilter.itemClass === 'Floors';
      const selectionsPerPage = 300;
      const filteredItems = isFloors ?
        Content.getFloors() :
        filterMetaItems(state.selectionFilter.itemClass, state.selectionFilter.text);
      const numPages = Math.ceil(filteredItems.length / selectionsPerPage);
      const startIndex = selectionsPerPage * state.selectionFilter.page;
      const paginatedItems = filteredItems.slice(startIndex, startIndex + selectionsPerPage);
      const Selections = isFloors ?
        <FloorSelections floors={paginatedItems as MetaFloor[]}></FloorSelections> :
        <ItemSelections metaItems={paginatedItems as MetaItem[]}></ItemSelections>;

      return <div>
        <div>
          {FilterMenuItems}
        </div>
        <div>
          <Input
            name="textFilter"
            type={'text'}
            onInput={(e: InputEvent) => {
              linkState(this, 'selectionFilter.text')(e);
              this.setPage(0, numPages);
            }}
            value={state.selectionFilter.text}>
            Name Filter
          </Input>
          <div>
            <button onClick={() => this.setPage(state.selectionFilter.page - 1, numPages)}>{'<'}</button>
            <button onClick={() => this.setPage(state.selectionFilter.page + 1, numPages)}>{'>'}</button>
            page {state.selectionFilter.page + 1} of {numPages}
            {Selections}
          </div>
        </div>
      </div>;
    }

    setPage(page: number, numPages: number) {
      const newPage = Utils.clamp(page, 0, numPages - 1);
      this.setState({ ...this.state, selectionFilter: { ...this.state.selectionFilter, page: newPage } });
    }

    setItemClassFilter(itemClass: string) {
      const isSame = itemClass === this.state.selectionFilter.itemClass;
      const newValue = isSame ? '' : itemClass;
      this.setState({
        ...this.state,
        selectionFilter: {
          ...this.state.selectionFilter,
          page: 0,
          itemClass: newValue,
        },
      });
    }
  }

  const el = adminModule.game.makeUIWindow();
  el.classList.add('ui-admin');
  render(<AdminWindow />, el);
  return el;
}
