import {render, h, Component} from 'preact';
import {useEffect, useState} from 'preact/hooks';

import {SECTOR_SIZE} from '../../constants.js';
import * as Content from '../../content.js';
import {game} from '../../game-singleton.js';
import {gen_wfc} from '../../mapgen.js';
import * as CommandBuilder from '../../protocol/command-builder.js';
import * as Utils from '../../utils.js';
import {WorldMapPartition} from '../../world-map-partition.js';
import {ClientEvents} from '../event-emitter.js';
import {AdminModule} from '../modules/admin-module.js';

import {
  ComponentProps, createSubApp, FloorGraphic, Graphic,
  Input, ItemGraphic, PaginatedContent, TabbedPane, TabbedPaneProps,
} from './ui-common.js';

const TOOLS = ['point', 'rectangle', 'fill'] as const;
type Tool = typeof TOOLS[number];
export interface State {
  selected?: { type: SelectionType; id: number };
  selectionFilter: {
    itemClass: string;
  };
  tool: Tool;
  safeMode: boolean;
}
const initialState: State = {
  selectionFilter: {
    itemClass: '',
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

  const itemClassesOrdered = Utils.sortByPrecedence([...classToMetaItem.keys()], [
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
      const [filterText, setFilterText] = useState('');

      const FilterMenuItems = selectionFilters.map((filter) => {
        let length = 0;
        if (filter.type === 'floors') {
          length = Content.getFloors().length;
        } else {
          const metaItems = filterMetaItems(filter.value, filterText);
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
        filterMetaItems(props.selectionFilter.itemClass, filterText);

      const renderSelections = isFloors ? this.renderFloorSelections : this.renderItemSelections;

      return <div class="flex">
        <div>
          {FilterMenuItems}
        </div>
        <div>
          <Input
            name="textFilter"
            type={'text'}
            onInput={(e: any) => setFilterText(e.target.value)}
            value={filterText}>
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

  interface MapViewProps {
    partition: WorldMapPartition;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
  }
  class MapView extends Component<MapViewProps> {
    render(props: MapViewProps) {
      const rows: any[][] = [];

      for (let j = 0; j < props.height; j++) {
        const row: any[] = [];
        rows.push(row);
        for (let i = 0; i < props.width; i++) {
          const tile = props.partition.getTile({x: i + props.x, y: j + props.y, z: props.z});
          const floorGfx = <FloorGraphic floor={tile.floor}></FloorGraphic>;
          const itemGfx = tile.item && <ItemGraphic item={tile.item}></ItemGraphic>;
          if (!itemGfx) {
            row.push(floorGfx);
          } else {
            row.push(<div class="mapview__tile">
              {floorGfx}
              {itemGfx}
            </div>);
          }
        }
      }

      return <div>
        {rows.map((row) => {
          return <div class='mapview__row'>{row}</div>;
        })}
      </div>;
    }
  }

  class MapsTab extends Component<Props> {
    render(props: Props) {
      const [metas, setMetas] = useState<PartitionMeta[] | null>(null);
      const [destructive, setDestructive] = useState(false);

      function requestMetas() {
        game.client.connection.sendCommand(CommandBuilder.adminRequestPartitionMetas()).then((newMetas) => {
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
              text: `/newPartition test ${SECTOR_SIZE} ${SECTOR_SIZE} 1`,
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
            <button onClick={() => {
              game.client.connection.sendCommand(CommandBuilder.chat({
                text: '/expandPartition x',
              }));
            }}>Expand width {SECTOR_SIZE} tiles</button>
            <button onClick={() => {
              game.client.connection.sendCommand(CommandBuilder.chat({
                text: '/expandPartition y',
              }));
            }}>Expand height {SECTOR_SIZE} tiles</button>
            <button onClick={() => {
              game.client.connection.sendCommand(CommandBuilder.chat({
                text: '/expandPartition z',
              }));
            }}>Expand depth</button>
            {destructive ? <button>Delete</button> : null}
          </div>;
        })}
      </div>;
    }
  }

  class NewMapTab extends Component<Props> {
    render(props: Props) {
      const [pos, setPos] = useState({...game.client.creature.pos});
      const [wfcInputWidth, setWfcInputWidth] = useState(5);
      const [wfcInputHeight, setWfcInputHeight] = useState(5);
      const [preview, setPreview] = useState<WorldMapPartition|null>(null);
      const [, rerender] = useState({});

      useEffect(() => {
        const fn1 = ({to}: ClientEvents['playerMove']) => {
          setPos(to);
        };
        const fn2 = ({type}: ClientEvents['event']) => {
          if (type === 'setItem' || type === 'setFloor') {
            rerender({});
          }
        };
        game.client.eventEmitter.on('playerMove', fn1);
        game.client.eventEmitter.on('event', fn2);
        return () => {
          game.client.eventEmitter.off('playerMove', fn1);
          game.client.eventEmitter.off('event', fn2);
        };
      }, []);

      const currentCreaturePartition = game.client.context.map.partitions.get(game.client.creature.pos.w);

      return <div>
        <div>Wave form collapse</div>

        <div>
          <label>Width:</label>
          <button onClick={() => setWfcInputWidth(Math.max(wfcInputWidth - 1, 1))}>-</button>
          <button onClick={() => setWfcInputWidth(Math.min(wfcInputWidth + 1, 20))}>+</button>
          <label>Height:</label>
          <button onClick={() => setWfcInputHeight(Math.max(wfcInputHeight - 1, 1))}>-</button>
          <button onClick={() => setWfcInputHeight(Math.min(wfcInputHeight + 1, 20))}>+</button>
        </div>

        <div>
          Input: {wfcInputWidth}x{wfcInputHeight}
          {currentCreaturePartition &&
            <MapView partition={currentCreaturePartition} {...pos}
              width={wfcInputWidth} height={wfcInputHeight}></MapView>}

          <button onClick={() => {
            const creature = game.client.creature;
            const inputPos = {...creature.pos};
            const inputTiles = [];
            for (let i = 0; i < wfcInputWidth; i++) {
              for (let j = 0; j < wfcInputHeight; j++) {
                const tile =
                  Utils.clone(game.client.context.map.getTile({...inputPos, x: inputPos.x + i, y: inputPos.y + j}));
                tile.elevation = 0;
                inputTiles.push(tile);
              }
            }
            const partition = gen_wfc({
              inputTiles,
              inputTilesWidth: wfcInputWidth,
              inputTilesHeight: wfcInputHeight,
              n: 2,
              width: 20,
              height: 20,
            });
            setPreview(partition);
          }}>Generate</button>
          <button onClick={() => {
            if (!preview) return;

            const tiles = [];
            for (const {tile} of preview.getIteratorForArea({x: 0, y: 0, z: 0}, preview.width, preview.height)) {
              tiles.push(tile);
            }

            game.client.connection.sendCommand(CommandBuilder.createPartition({
              tiles,
              width: preview.width,
              height: preview.height,
            }));
          }}>Save</button>

          Output: {preview &&
            <MapView partition={preview} x={0} y={0} z={0} width={preview.width} height={preview.height}></MapView>}
        </div>
      </div>;
    }
  }

  class ScriptsTab extends Component<Props> {
    render(props: Props) {
      const [scriptStates, setScriptStates] = useState<ScriptState[] | null>(null);

      useEffect(() => {
        game.client.connection.sendCommand(CommandBuilder.adminRequestScripts()).then((newScriptStates) => {
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
    newMap: {
      label: 'New Map',
      content: NewMapTab,
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
