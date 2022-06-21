import {h} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';
import createStore from 'redux-zero';
import Store from 'redux-zero/interfaces/Store';
import {Provider, connect} from 'redux-zero/preact';
import {ActionsObject, BoundActions} from 'redux-zero/types/Actions';

import {ProtocolEvent} from '../../protocol/event-builder.js';
import {WorldMapPartition} from '../../world-map-partition.js';
import {Game} from '../game.js';

export type ComponentProps<S, T extends ActionsObject<S>> = S & BoundActions<S, (store: Store<S>) => T>;
type OmitFirstArg<F> = F extends (x: any, ...args: infer P) => infer R ? (...args: P) => R : never;
type ExportedActions<A> = { [K in keyof A]: A[K] extends Function ? OmitFirstArg<A[K]> : never };

export function createSubApp<
  S extends {},
  A extends Record<string,(prevState: S, ...args: any[]) => S>
>(component: any, initialState: S, actions: A) {
  const mapToProps = (f: any) => f;
  const ConnectedComponent = connect(mapToProps, () => actions)(component);
  const store = createStore(initialState);
  const SubApp = () => (
    <Provider store={store}>
      <ConnectedComponent />
    </Provider>
  );

  // @ts-expect-error
  const exportedActions: ExportedActions<A> = {};
  for (const [key, fn] of Object.entries(actions)) {
    // @ts-expect-error
    exportedActions[key] = (...args: any[]) => {
      const newState = fn(store.getState(), ...args);
      store.setState(newState);
    };
  }

  const subscribe = (fn: (state: S) => void) => {
    store.subscribe(fn);
  };

  return {SubApp, exportedActions, subscribe};
}

export function usePartition(game: Game, w: number) {
  const [partition, setPartition] = useState<WorldMapPartition | null>(null);

  const partitionRequest = useMemo(() => {
    return game.client.getOrRequestPartition(w);
  }, [w]);
  if (!partitionRequest.partition) {
    partitionRequest.promise.then(setPartition);
  } else if (partitionRequest.partition !== partition) {
    setPartition(partitionRequest.partition);
  }

  return partition;
}

export function useCreature(game: Game, id: number) {
  const creature = game.client.context.creatures.get(id);
  const [, setCreature] = useState(creature);

  useEffect(() => {
    const fn = (event: ProtocolEvent) => {
      if (event.type === 'setCreature' && event.args.id === id) {
        setCreature(creature ? {...creature} : undefined);
      }
    };
    game.client.eventEmitter.addListener('event', fn);
    return () => game.client.eventEmitter.removeListener('event', fn);
  }, [creature, id]);

  return creature;
}

export function usePlayer(game: Game) {
  const [player, setPlayer] = useState(game.client.player);

  useEffect(() => {
    const fn = (event: ProtocolEvent) => {
      if (event.type === 'initialize') {
        setPlayer({...game.client.player});
      }
    };
    game.client.eventEmitter.addListener('event', fn);
    return () => game.client.eventEmitter.removeListener('event', fn);
  }, []);

  return player;
}

export function useContainerItems(game: Game, container: Container) {
  const [, setItems] = useState(container.items);

  useEffect(() => {
    const fn = (event: ProtocolEvent) => {
      if (event.type === 'setContainer' && event.args.id === container.id) {
        setItems([...container.items]);
      }
    };
    game.client.eventEmitter.addListener('event', fn);
    return () => game.client.eventEmitter.removeListener('event', fn);
  });

  return container.items;
}

export function c(...classNames: Array<string | false>) {
  return classNames.filter(Boolean).join(' ');
}
