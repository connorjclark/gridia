import type {FieldProps} from '@rjsf/core';
// @ts-expect-error
import NumberField from '@rjsf/core/lib/components/fields/NumberField';
import type {JSONSchema7} from 'json-schema';
import {render, h, Component, Fragment} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';

import {GFX_SIZE, SECTOR_SIZE} from '../../../constants.js';
import * as Content from '../../../content.js';
import {game} from '../../../game-singleton.js';
import {gen_wfc} from '../../../mapgen.js';
import * as CommandBuilder from '../../../protocol/command-builder.js';
import * as Utils from '../../../utils.js';
import {WorldMapPartition} from '../../../world-map-partition.js';
import {ClientEvents} from '../../event-emitter.js';
import {AdminModule} from '../../modules/admin-module.js';
import {CreatureGraphic, Graphic} from '../components/graphic.js';
import {Input} from '../components/input.js';
import {MapView} from '../components/map-view.js';
import {PaginatedContent} from '../components/paginated-content.js';
import {Form, withUiSchemaFromSchema} from '../components/schema-form.js';
import schemas from '../components/schemas.json';
import {TabbedPane} from '../components/tabbed-pane.js';
import {c, ComponentProps, createSubApp, usePartition} from '../ui-common.js';
import {wfcInputs} from '../wfc-inputs.js';

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
  return <div
    class={c('admin__selection', props.selected && 'admin__selection--selected')}
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
  const actions = {
    setState(state: State, newState: Partial<State>) {
      return {
        ...state,
        ...newState,
      };
    },
  };

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

  // TODO: use functions instead of classes
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

        const nonEmpty = length > 0;
        const enabled = nonEmpty &&
          (!props.selectionFilter.itemClass || props.selectionFilter.itemClass === filter.value) &&
          (filter.value !== 'Floors' || props.selectionFilter.itemClass === 'Floors');
        return <div
          class={c('admin__filter', !enabled && 'admin__filter--empty')}
          onClick={() => nonEmpty && this.setItemClassFilter(filter.value)}
        >
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
              class={c('admin__tool', props.tool === tool && 'admin__tool--selected')}
              onClick={() => this.onClickTool(tool)}
            >{tool}</div>;
          })}

          <div
            class={c('admin__tool', props.safeMode && 'admin__tool--selected')}
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

  const MapsTab = () => {
    const [selectedMapIndex, setSelectedMapIndex] = useState(0);
    const [metas, setMetas] = useState<PartitionMeta[] | null>(null);
    const [destructive, setDestructive] = useState(false);

    function requestMetas() {
      game.client.connection.sendCommand(CommandBuilder.adminRequestPartitionMetas()).then((newMetas) => {
        setMetas(newMetas);
      });
    }

    useEffect(() => {
      requestMetas();
    }, []);

    if (metas === null) {
      return <div>
        loading ...
      </div>;
    }

    const currentPartition = usePartition(game, selectedMapIndex);
    let currentMapView;
    if (currentPartition) {
      currentMapView = <MapView
        partition={currentPartition}
        focusPos={{w: selectedMapIndex, x: 0, y: 0, z: 0}}
        sizing={{type: 'fixed', canvasWidth: 300, canvasHeight: 300}}
        allowDrag={true}
        allowZoom={true}
        blinkFocusPos={false}
        chunked={false}
      ></MapView>;
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

      <div>
        <h3>Modify current map #{game.client.creature.pos.w} {metas[game.client.creature.pos.w].name}</h3>

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
      </div>

      <h3>Select Map</h3>
      <div class="partition-list">
        {metas.map((meta, index) => {
          return <div class={c('partition', index === selectedMapIndex && 'partition--selected')}
            onClick={() => setSelectedMapIndex(index)}>
            <div class="partition__name">#{index} {meta.name}</div>
            <div class="partition__size">Width, Height, Depth: {meta.width}, {meta.height}, {meta.depth}</div>
          </div>;
        })}
      </div>

      <button onClick={() => {
        const meta = metas[selectedMapIndex];
        game.client.connection.sendCommand(CommandBuilder.chat({
          text: `/warp ${Math.round(meta.width / 2)} ${Math.round(meta.height / 2)} 0 ${selectedMapIndex}`,
        }));
      }}>Warp</button>

      {currentMapView}
    </div>;
  };

  const NewMapTab = () => {
    const [inputSelectionIndex, setInputSelectionIndex] = useState(0);
    const [pos, setPos] = useState({...game.client.creature.pos});
    const [wfcInputWidth, setWfcInputWidth] = useState(5);
    const [wfcInputHeight, setWfcInputHeight] = useState(5);
    const [preview, setPreview] = useState<WorldMapPartition | null>(null);
    const [, rerender] = useState({});

    const savedInputs = Content.getWorldDataDefinition().baseDir === 'worlds/rpgwo-world' ? wfcInputs : [];

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

    const inputTiles = useMemo(() => {
      let input;
      if (inputSelectionIndex === 0) {
        const inputPos = pos;
        const tiles = [];
        for (let j = 0; j < wfcInputHeight; j++) {
          for (let i = 0; i < wfcInputWidth; i++) {
            const tile =
              Utils.clone(game.client.context.map.getTile({...inputPos, x: inputPos.x + i, y: inputPos.y + j}));
            tile.elevation = 0;
            tiles.push(tile);
          }
        }
        input = {
          tiles,
          width: wfcInputWidth,
          height: wfcInputHeight,
        };
        // @ts-expect-error
        window.Gridia.debugAdminWfcTiles =
          {width: wfcInputWidth, height: wfcInputHeight, tiles};
      } else {
        input = savedInputs[inputSelectionIndex - 1];
      }

      return input;
    }, [inputSelectionIndex, pos, wfcInputWidth, wfcInputHeight]);

    const inputPartition = useMemo(() => {
      // TODO: hardcoding 40, which is bigger than max of 32.
      const partition = WorldMapPartition.createEmptyWorldMapPartition('', 40, 40, 1);
      for (let i = 0; i < inputTiles.tiles.length; i++) {
        const inputPos = {x: i % inputTiles.width, y: Math.floor(i / inputTiles.width), z: 0};
        partition.setTile(inputPos, inputTiles.tiles[i]);
      }
      return partition;
    }, [inputTiles]);

    const inputPreview = <MapView
      partition={inputPartition}
      focusPos={{w: 0, x: 0, y: 0, z: 0}}
      sizing={{
        type: 'fixed',
        canvasWidth: inputTiles.width * GFX_SIZE * 0.5,
        canvasHeight: inputTiles.height * GFX_SIZE * 0.5,
      }}
      zoom0TileScale={0.5}
      allowDrag={true}
      allowZoom={false}
      initialZoomLevel={0}
      blinkFocusPos={false}
      chunked={false}
    ></MapView>;

    return <div>
      <div>Wave form collapse</div>

      <h3>Input</h3>

      <select onChange={(e: any) => setInputSelectionIndex(e.target.valueAsNumber)} value={inputSelectionIndex}>
        <option value={0}>Use current location</option>
        {savedInputs.map((_, i) => <option value={i + 1}>Input #{i + 1}</option>)}
      </select>

      {inputSelectionIndex === 0 &&
        <>
          <div>
            {wfcInputWidth}x{wfcInputHeight}
            <label>Width:</label>
            <button onClick={() => setWfcInputWidth(Math.max(wfcInputWidth - 1, 1))}>-</button>
            <button onClick={() => setWfcInputWidth(Math.min(wfcInputWidth + 1, 32))}>+</button>
            <label>Height:</label>
            <button onClick={() => setWfcInputHeight(Math.max(wfcInputHeight - 1, 1))}>-</button>
            <button onClick={() => setWfcInputHeight(Math.min(wfcInputHeight + 1, 32))}>+</button>
          </div>
        </>
      }

      {inputPreview}

      <div>
        <button onClick={() => {
          const partition = gen_wfc({
            inputTiles: inputTiles.tiles,
            inputTilesWidth: inputTiles.width,
            inputTilesHeight: inputTiles.height,
            n: 2,
            width: 100,
            height: 100,
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
        }}>Create Map</button>
      </div>

      <h3>Preview</h3>
      {preview &&
        <MapView
          partition={preview}
          focusPos={{w: 0, x: 0, y: 0, z: 0}}
          sizing={{type: 'fixed', canvasWidth: 300, canvasHeight: 300}}
          allowDrag={true}
          allowZoom={true}
          blinkFocusPos={false}
          chunked={false}
        ></MapView>}
    </div>;
  };

  const ScriptsTab = () => {
    const [scriptStates, setScriptStates] = useState<ScriptState[] | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const requestStates = () => {
      game.client.connection.sendCommand(CommandBuilder.adminRequestScripts()).then((newScriptStates) => {
        setScriptStates(newScriptStates);
      });
    };

    useEffect(requestStates, []);

    if (scriptStates === null) {
      return <div>
        loading ...
      </div>;
    }

    const selectedScriptState = scriptStates[selectedIndex];

    const configForm = selectedScriptState.configSchemaType && <Form
      formData={selectedScriptState.config}
      schema={{
        $ref: `#/definitions/${selectedScriptState.configSchemaType}`,
        ...schemas,
      } as JSONSchema7}
      fields={{
        NumberField: withUiSchemaFromSchema(NumberField),
      }}
      widgets={{
        CreatureTypeWidget: (props: FieldProps<number>) => {
          const [value, setValue] = useState(props.formData ?? props.value ?? 0);
          const update = (newValue: number) => {
            setValue(newValue);
            props.onChange(newValue);
          };

          const creatureData = useMemo(() => {
            return Content.getMonsterTemplates().filter(Boolean).map((monster) => {
              return {
                id: monster.id,
                name: monster.name,
              };
            });
          }, []);

          return <div>
            <CreatureGraphic type={value}></CreatureGraphic>
            <label>
              Type
              <select
                value={value}
                onChange={(e: any) => update(Number(e.target.value))}
              >
                {creatureData.map((data) => {
                  return <option value={data.id}>{data.name}</option>;
                })}
              </select>
            </label>
          </div>;
        },
      }}
      onSubmit={async (e) => {
        const value = e.formData;
        await game.client.connection.sendCommand(CommandBuilder.adminSetScriptConfig({
          id: selectedScriptState.id,
          key: '',
          value,
        }));
        requestStates();

        // Request again in a moment.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        requestStates();
      }}
    ></Form>;

    return <div class="m1">
      <div>
        {scriptStates.map((script, i) => {
          return <div
            class={c('script', selectedIndex === i && 'script--selected')}
            onClick={() => setSelectedIndex(i)}
          >
            {script.id}
          </div>;
        })}
      </div>
      <div>
        <h2>Config</h2>
        {configForm}
      </div>
      <div>
        <h2>State</h2>
        <pre>
          {JSON.stringify(scriptStates[selectedIndex], null, 2)}
        </pre>
      </div>
    </div>;
  };

  const tabs = {
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

  const AdminWindow = (props: Props) => {
    return <TabbedPane tabs={tabs} childProps={props}></TabbedPane>;
  };

  const {SubApp, exportedActions, subscribe} = createSubApp(AdminWindow, initialState, actions);
  const delegate = adminModule.game.windowManager.createWindow({
    id: 'admin',
    cell: 'right',
    tabLabel: 'Admin',
    fill: true,
    onInit(el) {
      render(<SubApp />, el);
    },
  });

  return {delegate, actions: exportedActions, subscribe};
}
