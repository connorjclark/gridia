import { render, h, Component, Fragment } from 'preact';
import linkState from 'linkstate';
import * as Content from '../../content';
import * as Helper from '../helper';
import * as Utils from '../../utils';
import AdminModule from '../modules/admin-module';
import { Graphic } from './ui-common';

const TOOLS = ['point', 'rectangle'] as const;
type Tool = typeof TOOLS[number];
export interface State {
  selected?: { type: SelectionType; id: number };
  selectionFilter: {
    itemClass: string;
    text: string;
    page: number;
  };
  tool: Tool;
  safeMode: boolean;
}
const DEFAULT_STATE: State = {
  selectionFilter: {
    itemClass: '',
    text: '',
    page: 0,
  },
  tool: 'point',
  safeMode: true,
};

const Input = (props: any) => {
  return <Fragment>
    <label>{props.children || props.name}</label>
    <input {...props}></input>
    {props.type === 'range' && props.value}
  </Fragment>;
};

type SelectionType = 'item' | 'floor';

interface SelectionProps {
  type: SelectionType;
  id: number;
  graphicIndex: number;
  title: string;
  selected: boolean;
  onClickSelection: (arg: { type: SelectionType; id: number }) => void;
}
const Selection = (props: SelectionProps) => {
  const classes = [
    'admin__selection',
  ];
  if (props.selected) classes.push('admin__selection--selected');

  return <div
    class={classes.join(' ')}
    title={props.title}
    onClick={() => props.onClickSelection({ type: props.type, id: props.id })}
  >
    <Graphic
      type={props.type}
      index={props.graphicIndex}
    ></Graphic>
  </div>;
};

interface ItemSelectionsProps {
  metaItems: MetaItem[];
  selectedId?: number;
  onClickSelection: (arg: { type: SelectionType; id: number }) => void;
}
const ItemSelections = (props: ItemSelectionsProps) => {
  return <div class="admin__selections">
    {props.metaItems.map((metaItem) => {
      const graphicIndex = metaItem.animations ? (metaItem.animations[0] || 0) : 0;
      return <Selection
        type={'item'}
        id={metaItem.id}
        graphicIndex={graphicIndex}
        title={metaItem.name}
        selected={props.selectedId === metaItem.id}
        onClickSelection={props.onClickSelection}
      ></Selection>;
    })}
  </div>;
};

interface FloorSelectionsProps {
  floors: MetaFloor[];
  selectedId?: number;
  onClickSelection: (arg: { type: SelectionType; id: number }) => void;
}
const FloorSelections = (props: FloorSelectionsProps) => {
  return <div class="admin__selections">
    {props.floors.map((floor) => {
      const graphicIndex = floor.id;
      return <Selection
        type={'floor'}
        id={floor.id}
        graphicIndex={graphicIndex}
        title={'Floor'}
        selected={props.selectedId === floor.id}
        onClickSelection={props.onClickSelection}
      ></Selection>;
    })}
  </div>;
};

function tryRegex(value: string, flags = '') {
  try {
    return new RegExp(value, flags);
  } catch (_) {
    return;
  }
}

export function makeAdminWindow(adminModule: AdminModule): HTMLElement {
  const validMetaItems = Content.getMetaItems().filter((item) => item.name !== 'Unknown');

  const classToMetaItem = new Map<string, MetaItem[]>();
  for (const metaItem of validMetaItems) {
    if (metaItem.name === 'Unknown') continue;

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

  function filterMetaItems(itemClass: string, text: string) {
    let metaItems = classToMetaItem.get(itemClass) || validMetaItems;
    const regex = text && tryRegex(text, 'i');
    if (regex) {
      metaItems = metaItems.filter((item) => item.name.match(regex));
    }
    return metaItems;
  }

  class AdminWindow extends Component<any, State> {
    state = DEFAULT_STATE;

    constructor() {
      super();
      this.onClickSelection = this.onClickSelection.bind(this);
    }

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
          'admin__filter',
        ];
        const nonEmpty = length > 0;
        const enabled = nonEmpty &&
          (!state.selectionFilter.itemClass || state.selectionFilter.itemClass === filter.value) &&
          (filter.value !== 'Floors' || state.selectionFilter.itemClass === 'Floors');
        if (!enabled) classes.push('admin__filter--empty');
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
        <FloorSelections
          onClickSelection={this.onClickSelection}
          selectedId={state.selected?.type === 'floor' ? state.selected?.id : undefined}
          floors={paginatedItems as MetaFloor[]}></FloorSelections> :
        <ItemSelections
          onClickSelection={this.onClickSelection}
          selectedId={state.selected?.type === 'item' ? state.selected?.id : undefined}
          metaItems={paginatedItems as MetaItem[]}></ItemSelections>;

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

          {TOOLS.map((tool) => {
            return <div
              class={`admin__tool ${state.tool === tool ? 'admin__tool--selected' : ''}`}
              onClick={() => this.onClickTool(tool)}
            >{tool}</div>;
          })}

          <div
            class={`admin__tool ${state.safeMode ? 'admin__tool--selected' : ''}`}
            title="Enable to prevent overwriting existing items"
            onClick={() => this.onClickSafeMode()}
          >Safe Mode</div>

          <div>
            <button onClick={() => this.setPage(state.selectionFilter.page - 1, numPages)}>{'<'}</button>
            <button onClick={() => this.setPage(state.selectionFilter.page + 1, numPages)}>{'>'}</button>
            page {state.selectionFilter.page + 1} of {numPages}
            {Selections}
          </div>
        </div>
      </div>;
    }

    onClickSelection(selected?: { type: SelectionType; id: number }) {
      if (selected?.type === this.state.selected?.type && selected?.id === this.state.selected?.id) {
        selected = undefined;
      }
      this.setState({
        selected,
      }, () => this.updateAdminModule());
    }

    onClickTool(tool: Tool) {
      this.setState({
        tool,
      }, () => this.updateAdminModule());
    }

    onClickSafeMode() {
      this.setState({
        safeMode: !this.state.safeMode,
      }, () => this.updateAdminModule());
    }

    // TODO: this all feels very hacky.
    updateAdminModule() {
      adminModule.setUIState({ ...this.state });
    }

    setPage(page: number, numPages: number) {
      const newPage = Utils.clamp(page, 0, numPages - 1);
      this.setState({ selectionFilter: { ...this.state.selectionFilter, page: newPage } });
    }

    setItemClassFilter(itemClass: string) {
      const isSame = itemClass === this.state.selectionFilter.itemClass;
      const newValue = isSame ? '' : itemClass;
      this.setState({
        selectionFilter: {
          ...this.state.selectionFilter,
          page: 0,
          itemClass: newValue,
        },
      });
    }
  }

  const el = adminModule.game.makeUIWindow({ name: 'admin', cell: 'center' });
  render(<AdminWindow />, el);
  return el;
}
