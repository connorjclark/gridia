import linkState from 'linkstate';
import {render, h, Component} from 'preact';
import {useEffect, useState} from 'preact/hooks';

import * as Content from '../../content.js';
import {game} from '../../game-singleton.js';
import * as CommandBuilder from '../../protocol/command-builder.js';
import * as Helper from '../helper.js';
import {AdminModule} from '../modules/admin-module.js';

import {
  ComponentProps, createSubApp, Graphic, Input, PaginatedContent, TabbedPane, TabbedPaneProps,
} from './ui-common.js';

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
const initialState: State = {
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
  } catch {
    return;
  }
}

export function makeAdminWindow(adminModule: AdminModule) {
  const actions = () => ({
    setState(state: State, newState: Partial<State>) {
      return {
        ...state,
        ...newState,
      };
    },
  });

  type Props = ComponentProps<State, typeof actions>;

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

  class ItemsFloorsTab extends Component<Props> {
    renderFloorSelections = (floors: MetaFloor[]) => <FloorSelections
      onClickSelection={this.onClickSelection}
      selectedId={this.props.selected?.type === 'floors' ? this.props.selected?.id : undefined}
      floors={floors}></FloorSelections>;

    renderItemSelections = (items: MetaItem[]) => <ItemSelections
      onClickSelection={this.onClickSelection}
      selectedId={this.props.selected?.type === 'items' ? this.props.selected?.id : undefined}
      metaItems={items}></ItemSelections>;

    constructor() {
      super();
      this.onClickSelection = this.onClickSelection.bind(this);
      this.renderFloorSelections = this.renderFloorSelections.bind(this);
      this.renderItemSelections = this.renderItemSelections.bind(this);
    }

    render(props: Props) {
      const FilterMenuItems = selectionFilters.map((filter) => {
        let length = 0;
        if (filter.type === 'floors') {
          length = Content.getFloors().length;
        } else {
          const metaItems = filterMetaItems(filter.value, props.selectionFilter.text);
          length = metaItems.length;
        }

        const classes = [
          'admin__filter',
        ];
        const nonEmpty = length > 0;
        const enabled = nonEmpty &&
          (!props.selectionFilter.itemClass || props.selectionFilter.itemClass === filter.value) &&
          (filter.value !== 'Floors' || props.selectionFilter.itemClass === 'Floors');
        if (!enabled) classes.push('admin__filter--empty');
        return <div class={classes.join(' ')} onClick={() => nonEmpty && this.setItemClassFilter(filter.value)}>
          {filter.value} - {length}
        </div>;
      });

      const isFloors = props.selectionFilter.itemClass === 'Floors';
      const filteredItems = isFloors ?
        Content.getFloors() :
        filterMetaItems(props.selectionFilter.itemClass, props.selectionFilter.text);

      const renderSelections = isFloors ? this.renderFloorSelections : this.renderItemSelections;

      return <div class="flex">
        <div>
          {FilterMenuItems}
        </div>
        <div>
          <Input
            name="textFilter"
            type={'text'}
            onInput={linkState(this, 'selectionFilter.text')}
            value={props.selectionFilter.text}>
            Name Filter
          </Input>

          <button title="Cmd-Z" onClick={() => adminModule.undo()}>Undo</button>
          <button title="Shift-Cmd-Z" onClick={() => adminModule.redo()}>Redo</button>

          {TOOLS.map((tool) => {
            return <div
              class={`admin__tool ${props.tool === tool ? 'admin__tool--selected' : ''}`}
              onClick={() => this.onClickTool(tool)}
            >{tool}</div>;
          })}

          <div
            class={`admin__tool ${props.safeMode ? 'admin__tool--selected' : ''}`}
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
      if (selected?.type === this.props.selected?.type && selected?.id === this.props.selected?.id) {
        selected = undefined;
      }
      this.props.setState({
        selected,
      });
    }

    onClickTool(tool: Tool) {
      this.props.setState({
        tool,
      });
    }

    onClickSafeMode() {
      this.props.setState({
        safeMode: !this.props.safeMode,
      });
    }

    setItemClassFilter(itemClass: string) {
      const isSame = itemClass === this.props.selectionFilter.itemClass;
      const newValue = isSame ? '' : itemClass;
      this.props.setState({
        selectionFilter: {
          ...this.props.selectionFilter,
          itemClass: newValue,
        },
      });
    }
  }

  class MapsTab extends Component<Props> {
    render(props: Props) {
      const [metas, setMetas] = useState<PartitionMeta[] | null>(null);
      const [destructive, setDestructive] = useState(false);

      function requestMetas() {
        game.client.connection.sendCommand(CommandBuilder.requestPartitionMetas({})).then((newMetas) => {
          setMetas(newMetas);
        });
      }

      useEffect(() => {
        requestMetas();
      });

      if (metas === null) {
        return <div>
          loading ...
        </div>;
      }

      return <div>
        <label>
          DESTRUCTIVE MODE
          <input type="checkbox" checked={destructive}
            onChange={(e) => setDestructive((e.target as HTMLInputElement).checked)}></input>
        </label>

        <div>
          <button onClick={async () => {
            // TODO: also add to chatbox.
            await game.client.connection.sendCommand(CommandBuilder.chat({
              text: '/newPartition test 100 100',
            }));
            requestMetas();
          }}>New Map</button>
        </div>

        {metas.map((meta, index) => {
          return <div class="partition">
            <div class="partition__name">{meta.name}</div>
            <div class="partition__size">Width, Height, Depth: {meta.width}, {meta.height}, {meta.depth}</div>

            <button onClick={() => {
              game.client.connection.sendCommand(CommandBuilder.chat({
                text: `/warp ${Math.round(meta.width / 2)} ${Math.round(meta.height / 2)} 0 ${index}`,
              }));
            }}>Warp</button>
            {destructive ? <button>Delete</button> : null}
          </div>;
        })}
      </div>;
    }
  }

  class ScriptsTab extends Component<Props> {
    render(props: Props) {
      const [scriptStates, setScriptStates] = useState<ScriptState[] | null>(null);

      useEffect(() => {
        game.client.connection.sendCommand(CommandBuilder.requestScripts({})).then((newScriptStates) => {
          setScriptStates(newScriptStates);
        });
      });

      if (scriptStates === null) {
        return <div>
          loading ...
        </div>;
      }

      return <pre>
        {JSON.stringify(scriptStates, null, 2)}
      </pre>;
    }
  }

  const tabs: TabbedPaneProps['tabs'] = {
    skills: {
      label: 'Items/Floors',
      content: ItemsFloorsTab,
    },
    maps: {
      label: 'Maps',
      content: MapsTab,
    },
    scripts: {
      label: 'Scripts',
      content: ScriptsTab,
    },
  };

  class AdminWindow extends Component<Props> {
    render(props: Props) {
      return <TabbedPane tabs={tabs} childProps={props}></TabbedPane>;
    }
  }

  const {SubApp, exportedActions, subscribe} = createSubApp(AdminWindow, initialState, actions);
  const delegate = adminModule.game.windowManager.createWindow({
    id: 'admin',
    cell: 'right',
    tabLabel: 'Admin',
    onInit(el) {
      render(<SubApp />, el);
    },
  });

  return {delegate, actions: exportedActions, subscribe};
}
