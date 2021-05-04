import { findPath } from '../path-finding';
import * as Content from '../content';
import * as EventBuilder from '../protocol/event-builder';
import * as Utils from '../utils';
import WorldMapPartition from '../world-map-partition';
import { Context } from '../context';
import * as Container from '../container';
import { calcStraightLine } from '../lib/line';
import Server from './server';
import aStar from './plan';
import { adjustAttribute } from './creature-utils';

interface Goal {
  desiredEffect: string;
  priority: number;
  satisfied(this: CreatureState, server: Server): boolean;
}

interface Action {
  name: string;
  cost: number;
  preconditions: string[];
  effects: string[];
  // If returns:
  //    true - action completed successfully, move on to next action
  //    false - action cannot complete, replan how to reach goal
  //    void - maintain action for another tick
  tick?(this: CreatureState, server: Server): boolean | void;
}

type Fact = (this: CreatureState, server: Server) => boolean;

const isGrass = (floor: number) => floor >= 110 && floor < 300;

const Facts: Record<string, Fact> = {
  'on-grass'(server) {
    return isGrass(server.context.map.getTile(this.creature.pos).floor);
  },
  'near-target'() {
    if (!this.targetCreature) return false;
    return Utils.maxDiff(this.creature.pos, this.targetCreature.creature.pos) <= 1;
  },
  'kill-creature'() {
    return !Boolean(this.targetCreature); // ?
  },
};

// TODO: Tame follow
const Actions: Record<string, Action> = {
  Wander: {
    name: 'Wander',
    cost: 100,
    preconditions: [],
    effects: ['wander'],
    tick() {
      // Just wander baby.
      if (this.path.length) return;

      const randomDest = { ...this.creature.pos };
      randomDest.x += Utils.randInt(-1, 1) * 3;
      randomDest.y += Utils.randInt(-1, 1) * 3;
      // TODO: use creature.roam to anchor to home.
      this.goto(randomDest);
    },
  },
  UnarmedMeleeAttack: {
    name: 'UnarmedMeleeAttack',
    cost: 10,
    preconditions: ['near-target'],
    effects: ['kill-creature'],
  },
  FollowTarget: {
    name: 'FollowTarget',
    cost: 1,
    preconditions: [],
    effects: ['near-target'],
    tick(server) {
      // TODO: This overloading feels wrong.
      let creatureToFollow = this.targetCreature?.creature;
      if (this.creature.tamedBy) {
        const tamedByPlayer = server.players.get(this.creature.tamedBy);
        if (tamedByPlayer) creatureToFollow = server.findCreatureForPlayer(tamedByPlayer);
      }

      if (!creatureToFollow) return false;
      if (creatureToFollow.pos.w !== this.creature.pos.w) return false;
      // TODO: Follow through stairs.
      if (creatureToFollow.pos.z !== this.creature.pos.z) return false;

      this.goto(creatureToFollow.pos);
      this.idle(server, 2000); // Throttle how often pathfinding runs.
    },
  },
  EatGrass: {
    name: 'EatGrass',
    cost: 1,
    preconditions: ['on-grass'],
    effects: ['food'],
    tick(server) {
      if (this.creature.food >= 100) {
        return true;
      }

      // TODO: tune these numbers. Maybe 3 full grass tiles / cow / day?
      this.creature.food += 10;
      // TODO: better abstraction for floors / grass.
      server.setFloor(this.creature.pos, server.context.map.getTile(this.creature.pos).floor - 20);
      this.idle(server, 1000 * 10);
    },
  },
  FindGrass: {
    name: 'FindGrass',
    cost: 1,
    preconditions: [],
    effects: ['on-grass'],
    tick(server) {
      if (isGrass(server.context.map.getTile(this.creature.pos).floor)) {
        return true;
      }

      if (this.path.length) return;

      // If there is grass nearby, go there.
      const loc = server.findNearest(this.creature.pos, 8, true,
        (tile, l) => server.context.walkable(l) && isGrass(tile.floor));
      if (loc) {
        this.goto(loc);
        return;
      }

      // Else just move somewhere else.
      const randomDest = { ...this.creature.pos };
      randomDest.x += Utils.randInt(-1, 1) * 8;
      randomDest.y += Utils.randInt(-1, 1) * 8;
      this.goto(randomDest);
    },
  },
};

// State that clients don't need and shouldn't have.
// Also isn't serialized - this state is transient.
export default class CreatureState {
  mode: string[] = [];
  // True if last movement was a warp. Prevents infinite stairs.
  warped = false;
  home: TilePoint;
  path: PartitionPoint[] = [];

  // For attacking.
  targetCreature: CreatureState | null = null;

  enemyCreatures: CreatureState[] = [];

  // @ts-ignore
  partition: WorldMapPartition;
  private ticksUntilNotIdle = 0;
  private ticksUntilNextMovement = 0;
  private ticksUntilNextAttack = 0;
  private ticksUntilRegeneration = 0;

  // GOAP
  private _actions: Action[];
  private goals: Goal[] = [];
  private currentGoal: Goal | null = null;
  private plannedActions: Action[] = [];

  private _shouldRecreatePlan = false;

  constructor(public creature: Creature, private context: Context) {
    this.home = creature.pos;
    this._actions = [
      Actions.UnarmedMeleeAttack,
      Actions.FollowTarget,
    ];

    if (this.creature.eat_grass) {
      this._actions.push(Actions.FindGrass);
      this._actions.push(Actions.EatGrass);
    }

    if (this.creature.roam || 0 > 0) { // TODO :/
      // This goal and the wander effect only exists to enact the Wander action.
      // Maybe there should be a simpler way to define a one-off like this.
      this._actions.push(Actions.Wander);
      this.addGoal({
        desiredEffect: 'wander',
        priority: 1,
        satisfied() {
          return false;
        },
      });
    }
  }

  pop() {
    if (this.mode.length) this.mode.pop();
  }

  goto(destination: TilePoint) {
    if (Utils.equalPoints(destination, this.creature.pos)) return;
    if (destination.w !== this.creature.pos.w) return;
    this.path = findPath(this.context, this.partition, this.creature.pos, destination);
  }

  idle(server: Server, time: number) {
    this.ticksUntilNotIdle = server.taskRunner.rateToTicks({ ms: time });
  }

  addGoal(newGoal: Goal) {
    for (const goal of this.goals) {
      if (goal.desiredEffect === newGoal.desiredEffect) {
        if (goal.priority !== newGoal.priority) {
          goal.priority = newGoal.priority;
          this._shouldRecreatePlan = true;
        }
        return;
      }
    }

    this.goals.push(newGoal);
    this._shouldRecreatePlan = true;
  }

  tick(server: Server) {
    if (this.ticksUntilNextAttack > 0) this.ticksUntilNextAttack--;
    if (this.ticksUntilNextMovement > 0) this.ticksUntilNextMovement--;
    if (this.ticksUntilNotIdle > 0) this.ticksUntilNotIdle--;
    if (this.ticksUntilRegeneration > 0) this.ticksUntilRegeneration--;

    if (this.ticksUntilRegeneration === 0) {
      this.ticksUntilRegeneration = server.taskRunner.rateToTicks({ seconds: 1 });
      const changed = (['life', 'stamina', 'mana'] as const).filter((attribute) => {
        if (this.creature[attribute].current < this.creature[attribute].max) {
          adjustAttribute(this.creature, attribute, 1);
          return true;
        }
      });
      if (changed.length) server.broadcastPartialCreatureUpdate(this.creature, changed);
    }

    if (!this.goals.length && this.creature.eat_grass) {
      if (this.creature.food <= 10) {
        this.addGoal({
          desiredEffect: 'food',
          priority: 10,
          satisfied() {
            return this.creature.food >= 100;
          },
        });
      }
    }

    if (this.creature.tamedBy) {
      this.addGoal({
        desiredEffect: 'near-target',
        priority: 10,
        satisfied() {
          return false;
        },
      });
    }

    if (this.currentGoal && this.currentGoal.satisfied.call(this, server)) {
      this.goals.splice(this.goals.indexOf(this.currentGoal), 1);
      this._shouldRecreatePlan = true;
    }
    if (!this.plannedActions.length) {
      this._shouldRecreatePlan = true;
    }
    if (this._shouldRecreatePlan) this._createPlan(server);

    this._handleMovement(server);
    this._handleAttack(server);

    if (this.ticksUntilNotIdle > 0) return;

    this.partition = server.context.map.getPartition(this.creature.pos.w);

    if (!this.goals.length) {
      return;
    }

    if (!this.plannedActions.length) return;

    const currentAction = this.plannedActions[this.plannedActions.length - 1];

    const passesPreconditons = currentAction.preconditions.every((p) => Facts[p].call(this, server));
    if (!passesPreconditons) {
      this._shouldRecreatePlan = true;
      return;
    }

    if (!currentAction.tick) return;
    const result = currentAction.tick.call(this, server);
    if (result) {
      this.plannedActions.pop();
    } else if (result === false) {
      this._shouldRecreatePlan = true;
    }
  }

  respondToCreatureRemoval(creature: Creature) {
    if (this.targetCreature?.creature === creature) {
      this.targetCreature = null;
    }

    const index = this.enemyCreatures.findIndex((enemy) => enemy.creature === creature);
    if (index !== -1) this.enemyCreatures.splice(index, 1);
  }

  private _createPlan(server: Server) {
    this._shouldRecreatePlan = false;
    this.plannedActions = [];
    this.currentGoal = null;
    if (!this.goals.length) return;

    this.currentGoal = this.goals.reduce((acc, cur) => acc.priority >= cur.priority ? acc : cur);
    this.ticksUntilNotIdle = 0;
    this.path = [];

    // Find plan.
    const actions = this._actions;
    const preconditions = new Set<string>();
    for (const action of actions) {
      for (const precondition of action.preconditions) {
        preconditions.add(precondition);
      }
    }

    const initialState: string[] = [];
    for (const precondition of preconditions) {
      if (Facts[precondition].call(this, server)) initialState.push(precondition);
    }
    initialState.sort();

    const desiredState = [this.currentGoal.desiredEffect];

    // Nodes are the state of the world from the creatures perspective.
    // Edges are actions that move the state from one to another (removing/adding an effect).
    // TODO: A regressive search (start at the desired goal and find a path to the initial state)
    //       is supposed to be more performant.
    const result = aStar({
      start: initialState,
      isEnd(state: string[]) {
        return desiredState.every((s) => state.includes(s));
      },
      edges(state: string[]) {
        const edges = [];
        for (const action of actions) {
          // An outbound edge is an action that adds an effect not already in this state.
          // All preconditions must apply.
          if (action.preconditions.every((p) => state.includes(p))) {
            const missingEffects = action.effects.filter((e) => !state.includes(e));
            for (const effect of missingEffects) {
              const newState = [...state, effect];
              edges.push({
                action,
                data: newState.sort(),
              });
              // console.log(`[${state.join(',')}] -> ${action.name} -> [${newState.join(',')}]`);
            }
          }
        }

        return edges;
      },
      distance(state1: string[], state2: string[], edge: { action: Action; data: string[] }) {
        return edge.action.cost;
      },
      heuristic(state: string[]) {
        return state.length - initialState.length;
      },
      hash(state: string[]) {
        return state.join(',');
      },
    });

    if (result.status !== 'success') {
      return;
    }

    // @ts-ignore
    this.plannedActions = result.path.map((p) => p.edge && p.edge.action).filter(Boolean).reverse();
    // console.log(this.plannedActions.map((a) => a.name).reverse());
  }

  private _handleMovement(server: Server) {
    if (this.creature.isPlayer) return;
    if (this.ticksUntilNextMovement > 0) return;

    const durationThresholds = [400, 750, 1000, 1500, 3500, 5000];
    const durationInMs = durationThresholds[Utils.clamp(this.creature.speed, 0, durationThresholds.length)];
    this.ticksUntilNextMovement = server.taskRunner.rateToTicks({ ms: durationInMs });

    const w = this.creature.pos.w;

    // Target the closest enemy.
    if (this.enemyCreatures.length && !this.targetCreature) {
      let closestEnemy: CreatureState | null = null;
      let closestDist = Number.MAX_VALUE;
      for (const enemy of this.enemyCreatures) {
        if (!enemy) continue;
        if (enemy.creature.pos.w !== w) continue;

        const dist = Utils.dist(enemy.creature.pos, this.creature.pos);
        if (!closestEnemy || closestDist > dist) {
          closestEnemy = enemy;
          closestDist = dist;
        }
      }

      if (closestEnemy) {
        this.targetCreature = closestEnemy;
        this.path = [];
        this.addGoal({
          desiredEffect: 'kill-creature',
          priority: 100,
          // TODO: LOS
          satisfied: () => closestEnemy ? closestEnemy.creature.life.current <= 0 : true,
        });
      }
    }

    if (this.path.length) {
      const newPos = { w, ...this.path.splice(0, 1)[0] };
      if (this.context.walkable(newPos)) {
        server.moveCreature(this.creature, newPos);
      } else {
        // Path has been obstructed - reset pathing.
        this.path = [];
      }
    }
  }

  private _handleAttack(server: Server) {
    if (!this.targetCreature || this.ticksUntilNextAttack > 0) return;

    // Range check.
    const distanceFromTarget = Utils.maxDiff(this.creature.pos, this.targetCreature.creature.pos);
    if (distanceFromTarget > 100) return;
    if (this.creature.pos.w !== this.targetCreature.creature.pos.w) return;
    if (this.creature.pos.z !== this.targetCreature.creature.pos.z) return;

    // TODO: regeneration for each attribute. only reset timer if that attribute was consumed.
    this.ticksUntilRegeneration = server.taskRunner.rateToTicks({ seconds: 5 });
    this.targetCreature.ticksUntilRegeneration = server.taskRunner.rateToTicks({ seconds: 5 });

    let attackSkill = Content.getSkillByNameOrThrowError('Unarmed Attack');
    const weaponType = this.creature.equipment && this.creature.equipment[Container.EQUIP_SLOTS.Weapon]?.type;
    const weaponMeta = weaponType ? Content.getMetaItem(weaponType) : null;
    if (weaponMeta) {
      if (weaponMeta.combatSkill !== undefined) {
        const skill = Content.getSkill(weaponMeta.combatSkill);
        if (skill) attackSkill = skill;
      }
    }

    const attackType = attackSkill?.purpose || 'melee';

    let missReason = null;
    const minRange = weaponMeta?.minRange || 0;
    const maxRange = weaponMeta?.maxRange || 1;
    if (distanceFromTarget < minRange) {
      missReason = 'too-close' as const;
    }
    if (distanceFromTarget > maxRange) {
      missReason = 'too-far' as const;
    }

    function useAttribute(creature: Creature, attribute: 'stamina' | 'mana', amount: number) {
      if (creature[attribute].current >= amount) {
        adjustAttribute(creature, attribute, -amount);
        server.broadcastPartialCreatureUpdate(creature, [attribute]);
        return true;
      } else {
        return false;
      }
    }

    if (!missReason) {
      let hasEnergyForAttack = false;
      if (attackType === 'magic') {
        hasEnergyForAttack = useAttribute(this.creature, 'mana', 1);
        if (!hasEnergyForAttack) missReason = 'need-mana' as const;
      } else {
        hasEnergyForAttack = useAttribute(this.creature, 'stamina', 1);
        if (!hasEnergyForAttack) missReason = 'need-stamina' as const;
      }
    }

    if (!missReason) {
      let hasAmmoForAttack = true;
      if (weaponMeta && attackType === 'missle' && this.creature.isPlayer) {
        const ammoTypeNeeded = weaponMeta.ammoType;
        const ammoItemEquipped = this.creature.equipment && this.creature.equipment[Container.EQUIP_SLOTS.Ammo];
        const ammoTypeEquipped = ammoItemEquipped && Content.getMetaItem(ammoItemEquipped.type).ammoType;
        hasAmmoForAttack = Boolean(ammoTypeNeeded && ammoTypeEquipped) && ammoTypeNeeded === ammoTypeEquipped;

        const clientConnection = server.getClientConnectionForCreature(this.creature);
        if (hasAmmoForAttack && clientConnection && ammoItemEquipped) {
          server.setItemInContainer(clientConnection.equipment.id, Container.EQUIP_SLOTS.Ammo, {
            ...ammoItemEquipped,
            quantity: ammoItemEquipped.quantity - 1,
          });
        }
      }

      if (!hasAmmoForAttack) missReason = 'need-ammo' as const;
    }

    let defenseSkill = Content.getSkillByNameOrThrowError('Melee Defense');
    if (attackType === 'magic') defenseSkill = Content.getSkillByNameOrThrowError('Magic Defense');
    if (attackType === 'missle') defenseSkill = Content.getSkillByNameOrThrowError('Missle Defense');

    if (!missReason) {
      // TODO use skill values.
      // const atk = attackSkill.level;
      const atk = 100;
      // @ts-expect-error
      const def = this.targetCreature.creature.stats[attackType + 'Defense'] as number || 0;
      let hitSuccess = Utils.randInt(0, atk) >= Utils.randInt(0, def);

      if (!hitSuccess) {
        if (attackType === 'magic') {
          if (!useAttribute(this.targetCreature.creature, 'mana', 1)) {
            hitSuccess = true;
          }
        } else {
          if (!useAttribute(this.targetCreature.creature, 'stamina', 1)) {
            hitSuccess = true;
          }
        }
      }

      if (!hitSuccess) missReason = 'blocked' as const;
    }

    let damage = 0;
    if (!missReason) {
      const damageRoll = Utils.randInt(this.creature.stats.damageLow, this.creature.stats.damageHigh);
      const armor = this.targetCreature.creature.stats.armor;
      damage = Math.round(damageRoll * damageRoll / (damageRoll + armor));
      damage = Utils.clamp(damage, 1, this.targetCreature.creature.life.current);

      if (weaponMeta && attackType === 'missle') {
        const path = calcStraightLine(this.creature.pos, this.targetCreature.creature.pos)
          .map((p) => ({ ...this.creature.pos, ...p }));
        // using findPath does a cool "homing" attack, around corners. could be used for a neat weapon?
        // findPath(this.context, this.partition, this.creature.pos, this.targetCreature.creature.pos)
        //   .map((p) => ({...p, w: this.creature.pos.w})),

        const isObstructed = !path.every((p) => {
          if (Utils.equalPoints(p, this.targetCreature?.creature.pos) || Utils.equalPoints(p, this.creature.pos)) {
            return true;
          }

          return server.context.walkable(p);
        });
        if (isObstructed) {
          missReason = 'obstructed' as const;
          damage = 0;
        } else {
          server.broadcastAnimation({
            name: 'Arrow',
            path,
          });
        }
      }
    }

    // TODO
    // const isCriticial = hitSuccess && hitSuccess && hitSuccess
    // const modifier = isCriticial ? Utils.randInt(2, 3) : 1;

    if (this.creature.isPlayer || this.targetCreature.creature.isPlayer) {
      // TODO: this won't work for PvP
      const clientConnection = server.getClientConnectionForCreature(this.creature) ||
        server.getClientConnectionForCreature(this.targetCreature.creature);
      if (clientConnection) {
        let text;
        if (this.creature.isPlayer) {
          if (!missReason) {
            text = `You hit ${this.targetCreature.creature.name} for ${damage} damage`;
          } else if (missReason === 'blocked') {
            text = `${this.targetCreature.creature.name} blocked your attack`;
          } else if (missReason === 'need-ammo') {
            text = 'You need more ammo!';
          } else if (missReason === 'need-mana') {
            text = 'You need more mana!';
          } else if (missReason === 'need-stamina') {
            text = 'You need more stamina!';
          } else if (missReason === 'too-close') {
            text = 'You are too close!';
          } else if (missReason === 'too-far') {
            text = 'You are too far away!';
          } else if (missReason === 'obstructed') {
            text = 'You don\'t have a clear line of sight!';
          }
        } else {
          if (!missReason) {
            text = `${this.creature.name} hit you for ${damage} damage`;
          } else if (missReason === 'blocked') {
            text = `You blocked ${this.creature.name}'s attack`;
          } else if (missReason === 'need-ammo') {
            // nothing
          } else if (missReason === 'need-mana') {
            // nothing
          } else if (missReason === 'need-stamina') {
            // nothing
          } else if (missReason === 'too-close') {
            // nothing
          } else if (missReason === 'too-far') {
            // nothing
          }
        }

        if (text) server.send(EventBuilder.chat({ section: 'Combat', text }), clientConnection);

        if (!missReason) {
          const xpModifier = this.creature.isPlayer ?
            this.targetCreature.creature.combatLevel / this.creature.combatLevel :
            this.creature.combatLevel / this.targetCreature.creature.combatLevel;
          const xp = Math.round(xpModifier * damage * 10);
          const skill = this.creature.isPlayer ? attackSkill : defenseSkill;
          server.grantXp(clientConnection, skill.id, xp);
        }
      }
    }

    this.ticksUntilNextAttack = server.taskRunner.rateToTicks({ seconds: this.creature.stats.attackSpeed });

    if (!missReason || missReason === 'blocked') {
      if (!this.targetCreature.enemyCreatures.includes(this)) {
        this.targetCreature.enemyCreatures.push(this);
      }
    }

    if (damage) server.modifyCreatureLife(this.creature, this.targetCreature.creature, -damage);
  }
}
