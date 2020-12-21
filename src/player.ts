export default class Player {
  public id = 0;
  public isAdmin = false;
  public name = '';
  // skill id -> xp
  public skills = new Map<number, number>();

  public constructor(public creature: Creature) {}
}
