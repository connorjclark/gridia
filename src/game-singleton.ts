import {Client} from './client/client.js';
import {Game} from './client/game.js';

export let game: Game;
export function makeGame(client: Client) {
  return game = new Game(client);
}
