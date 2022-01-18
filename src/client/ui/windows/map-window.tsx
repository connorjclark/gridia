import {render, h} from 'preact';

import {Game} from '../../game.js';
import {MapView} from '../components/map-view.js';
import {ComponentProps, createSubApp, usePartition} from '../ui-common.js';

interface State {
  pos: Point4;
  time: string;
}

export function makeMapWindow(game: Game, initialState: State) {
  const actions = {
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
  };

  type Props = ComponentProps<State, typeof actions>;
  const MapWindow = (props: Props) => {
    const pos = props.pos;
    const locationText = `${pos.x}, ${pos.y}, ${pos.z} (map ${pos.w})`;
    const partition = usePartition(game, pos.w);

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
        usePlayerTileSeenData={true}
      ></MapView>
      <div class="location">{locationText}</div>
      <div class="time">Time: {props.time}</div>
    </div>;
  };

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
