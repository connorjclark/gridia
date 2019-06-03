export default class Player {
  public id: number;
  public creature: Creature;
  // skill id -> xp
  public skills: Map<number, number> = new Map();
}
