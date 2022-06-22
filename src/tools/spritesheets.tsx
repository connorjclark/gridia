import {h, render, Component} from 'preact';

import {Graphic} from '../client/ui/components/graphic.js';
import * as Content from '../content.js';
import {clamp} from '../utils.js';

interface Props {
  worldDataDef: WorldDataDefinition;
}
interface State {
  currentSpritesheetIndex: number;
  currentSelection?: {
    type: 'item';
    value: MetaItem;
  } | {
    type: 'floor';
    value: MetaFloor;
  };
}

class App extends Component<Props, State> {
  state: State = {
    currentSpritesheetIndex: 0,
  };

  render(props: Props, state: State) {
    const curSrc =
      `/${props.worldDataDef.baseDir}/graphics/${props.worldDataDef.spritesheets[state.currentSpritesheetIndex]}`;

    return <div>
      <div>
        <button onClick={() => this.updateGraphicIndex(state.currentSpritesheetIndex - 1)}>
          Prev
        </button>
        <button onClick={() => this.updateGraphicIndex(state.currentSpritesheetIndex + 1)}>
          Next
        </button>
        {props.worldDataDef.spritesheets[state.currentSpritesheetIndex]}
      </div>
      <img
        src={curSrc}
        draggable={false}
        onClick={this.onClickImage.bind(this)}></img>

      <h3>Items</h3>

      {Content.getMetaItems().map((meta) => {
        if (!meta.graphics) console.log(meta);

        let className = 'item';
        if (state.currentSelection?.type === 'item' && state.currentSelection.value.id === meta.id) {
          className += ' selected';
        }

        const valueIfClicked = meta.id === state.currentSelection?.value.id ?
          undefined :
          {type: 'item', value: meta} as const;
        return <div
          key={meta.id}
          className={className}
          onClick={() => this.setState({currentSelection: valueIfClicked})}>

          <div className="item__graphics">
            <Graphic file={meta.graphics.file} index={meta.graphics.frames[0]}></Graphic>
          </div>
          {meta.name}
        </div>;
      })}

      <button onClick={() => this.onClickAddItem()}>
        Add Item
      </button>

      <h3>Floors</h3>

      {Content.getFloors().map((meta) => {
        let className = 'item';
        if (state.currentSelection?.type === 'floor' && state.currentSelection.value.id === meta.id) {
          className += ' selected';
        }

        const valueIfClicked = meta.id === state.currentSelection?.value.id ?
          undefined :
          {type: 'floor', value: meta} as const;
        return <div
          key={meta.id}
          className={className}
          onClick={() => this.setState({currentSelection: valueIfClicked})}>

          <div className="item__graphics">
            <Graphic file={meta.graphics.file} index={meta.graphics.frames[0]}></Graphic>
          </div>
        </div>;
      })}
    </div>;
  }

  onClickAddItem(): void {
    Content.getMetaItems().push({
      id: Content.getMetaItems().length,
      name: 'Unnamed Item',
      graphics: {
        file: this.props.worldDataDef.spritesheets[0],
        frames: [0],
      },
    } as MetaItem);
    this.setState(this.state);
  }

  updateGraphicIndex(newValue: number) {
    this.setState({
      currentSpritesheetIndex: clamp(newValue, 0, this.props.worldDataDef.spritesheets.length - 1),
    });
  }

  onClickImage(e: MouseEvent) {
    if (!this.state.currentSelection) return;

    const imgEl = e.target as HTMLImageElement;
    const scale = imgEl.width / imgEl.naturalWidth;
    const tilesAcross = Math.round(imgEl.width / scale / this.props.worldDataDef.tileSize);
    const x = Math.floor(e.clientX / scale / this.props.worldDataDef.tileSize);
    const y = Math.floor(e.clientY / scale / this.props.worldDataDef.tileSize);
    const index = x + y * tilesAcross;

    this.state.currentSelection.value.graphics = {
      file: this.props.worldDataDef.spritesheets[this.state.currentSpritesheetIndex],
      frames: [index],
    };
    this.setState({
      currentSelection: this.state.currentSelection,
    });
  }
}

async function main() {
  const qs = new URLSearchParams(location.search ? location.search.substring(1) : '');
  const world = qs.get('world') || 'bit';
  history.replaceState({}, '', `?world=${world}`);
  await Content.initializeWorldData(Content.WORLD_DATA_DEFINITIONS[world]);
  const worldDataDef = Content.getWorldDataDefinition();
  render(<App worldDataDef={worldDataDef}/>, document.body);
}

main();
