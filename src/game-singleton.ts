import {Client} from './client/client';
import {Game} from './client/game';

export let game: Game;
export function makeGame(client: Client) {
  return game = new Game(client);
}
