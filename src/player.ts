export default class Player {
  public id: number;
  public isAdmin: boolean;
  public name;
  public creature: Creature;
  // skill id -> xp
  public skills = new Map<number, number>();
}
