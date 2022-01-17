import {render, h, Component} from 'preact';
import {useMemo, useState} from 'preact/hooks';

import {WorldMapPartition} from '../../world-map-partition.js';
import {Game} from '../game.js';

import {MapView} from './map-view.js';
import {ComponentProps, createSubApp} from './ui-common.js';

interface State {
  pos: Point4;
  time: string;
}

export function makeMapWindow(game: Game, initialState: State) {
  const actions = () => ({
    setPos(state: State, pos: Point4) {
      return {
        ...state,
        pos,
      };
    },
    setTime(state: State, time: string) {
      return {
        ...state,
        time,
      };
    },
  });

  type Props = ComponentProps<State, typeof actions>;

  class MapWindow extends Component<Props> {
    render(props: Props) {
      const pos = props.pos;
      const locationText = `${pos.x}, ${pos.y}, ${pos.z} (map ${pos.w})`;

      const [partition, setPartition] = useState<WorldMapPartition | null>(null);
      const partitionRequest = useMemo(() => {
        return game.client.getOrRequestPartition(pos.w);
      }, [pos.w]);
      if (!partitionRequest.partition) {
        partitionRequest.promise.then(setPartition);
      } else if (partitionRequest.partition !== partition) {
        setPartition(partitionRequest.partition);
      }

      if (!partition) return <div>loading ...</div>;

      const sizing = {
        type: 'fixed',
        canvasWidth: 150,
        canvasHeight: 150,
      } as const;

      return <div>
        <MapView
          partition={partition}
          focusPos={pos}
          sizing={sizing}
          allowDrag={false}
          allowZoom={true}
          minZoomLevel={1}
          blinkFocusPos={true}
          chunked={true}
        ></MapView>
        <div class="location">{locationText}</div>
        <div class="time">Time: {props.time}</div>
      </div>;
    }
  }

  const {SubApp, exportedActions, subscribe} = createSubApp(MapWindow, initialState, actions);
  game.windowManager.createWindow({
    id: 'map',
    tabLabel: 'Map',
    cell: 'right',
    noscroll: true,
    onInit(el) {
      render(<SubApp />, el);
    },
    show: true,
  });

  return {actions: exportedActions, subscribe};
}
