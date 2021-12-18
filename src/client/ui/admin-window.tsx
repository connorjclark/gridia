import linkState from 'linkstate';
import {render, h, Component} from 'preact';

import * as Content from '../../content.js';
import * as Helper from '../helper.js';
import {AdminModule} from '../modules/admin-module.js';

import {Graphic, Input, PaginatedContent} from './ui-common.js';

const TOOLS = ['point', 'rectangle', 'fill'] as const;
type Tool = typeof TOOLS[number];
export interface State {
  selected?: { type: SelectionType; id: number };
  selectionFilter: {
    itemClass: string;
    text: string;
  };
  tool: Tool;
  safeMode: boolean;
}
const DEFAULT_STATE: State = {
  selectionFilter: {
    itemClass: '',
    text: '',
  },
  tool: 'point',
  safeMode: true,
};

type SelectionType = 'items' | 'floors';

interface SelectionProps {
  type: SelectionType;
  id: number;
  graphicFile: string;
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
    onClick={() => props.onClickSelection({type: props.type, id: props.id})}
  >
    <Graphic
      file={props.graphicFile}
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
      return <Selection
        type={'items'}
        id={metaItem.id}
        graphicFile={metaItem.graphics.file}
        graphicIndex={metaItem.graphics.frames[0]}
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
      return <Selection
        type={'floors'}
        id={floor.id}
        graphicFile={floor.graphics.file}
        graphicIndex={floor.graphics.frames[0]}
        title={`Floor ${floor.id}`}
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

export function makeAdminWindow(adminModule: AdminModule) {
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
    {type: 'equal', value: 'Normal'},
    {type: 'equal', value: 'None'},
  ]);

  const selectionFilters: Array<{ type: string; value: string }> = [];
  selectionFilters.push({type: 'floors', value: 'Floors'});
  for (const itemClass of itemClassesOrdered) {
    selectionFilters.push({type: 'class', value: itemClass});
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

    renderFloorSelections = (floors: MetaFloor[]) => <FloorSelections
      onClickSelection={this.onClickSelection}
      selectedId={this.state.selected?.type === 'floors' ? this.state.selected?.id : undefined}
      floors={floors}></FloorSelections>;

    renderItemSelections = (items: MetaItem[]) => <ItemSelections
      onClickSelection={this.onClickSelection}
      selectedId={this.state.selected?.type === 'items' ? this.state.selected?.id : undefined}
      metaItems={items}></ItemSelections>;

    constructor() {
      super();
      this.onClickSelection = this.onClickSelection.bind(this);
      this.renderFloorSelections = this.renderFloorSelections.bind(this);
      this.renderItemSelections = this.renderItemSelections.bind(this);
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
      const filteredItems = isFloors ?
        Content.getFloors() :
        filterMetaItems(state.selectionFilter.itemClass, state.selectionFilter.text);

      const renderSelections = isFloors ? this.renderFloorSelections : this.renderItemSelections;

      return <div>
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

          <button title="Cmd-Z" onClick={() => adminModule.undo()}>Undo</button>
          <button title="Shift-Cmd-Z"onClick={() => adminModule.redo()}>Redo</button>

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

          <PaginatedContent
            itemsPerPage={300}
            items={filteredItems}
            renderItems={renderSelections}></PaginatedContent>
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
      adminModule.setUIState({...this.state});
    }

    setItemClassFilter(itemClass: string) {
      const isSame = itemClass === this.state.selectionFilter.itemClass;
      const newValue = isSame ? '' : itemClass;
      this.setState({
        selectionFilter: {
          ...this.state.selectionFilter,
          itemClass: newValue,
        },
      });
    }
  }

  const delegate = adminModule.game.windowManager.createWindow({
    id: 'admin',
    cell: 'right',
    tabLabel: 'Admin',
    onInit(el) {
      render(<AdminWindow />, el);
    },
  });

  return {delegate};
}
