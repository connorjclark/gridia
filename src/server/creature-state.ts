import { findPath } from '../path-finding';
import * as Content from '../content';
import * as Utils from '../utils';
import WorldMapPartition from '../world-map-partition';
import { Context } from '../context';
import * as Container from '../container';
import * as EventBuilder from '../protocol/event-builder';
import { WATER } from '../constants';
import Server from './server';
import aStar from './plan';
import { adjustAttribute } from './creature-utils';
import ClientConnection from './client-connection';

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
        const tamedByPlayer = server.context.players.get(this.creature.tamedBy);
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
  onSpeakCallback?: (clientConnection: ClientConnection, speaker: Creature) => Dialogue | undefined;

  // For attacking.
  targetCreature: CreatureState | null = null;

  enemyCreatures: CreatureState[] = [];

  currentSpell?: Spell;

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

    if (this.creature.eatGrass) {
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

  resetRegenerationTimer(server: Server) {
    this.ticksUntilRegeneration = server.taskRunner.rateToTicks({ seconds: 5 });
  }

  tick(server: Server) {
    if (this.currentSpell?.target !== 'other') this.currentSpell = undefined;
    if (this.ticksUntilNextAttack > 0) this.ticksUntilNextAttack--;
    if (this.ticksUntilNextMovement > 0) this.ticksUntilNextMovement--;
    if (this.ticksUntilNotIdle > 0) this.ticksUntilNotIdle--;
    if (this.ticksUntilRegeneration > 0) this.ticksUntilRegeneration--;

    if (this.ticksUntilRegeneration === 0 && server.context.map.getTile(this.creature.pos).floor !== WATER) {
      this.ticksUntilRegeneration = server.taskRunner.rateToTicks({ seconds: 1 });
      const changed = (['life', 'stamina', 'mana'] as const).filter((attribute) => {
        if (this.creature[attribute].current < this.creature[attribute].max) {
          adjustAttribute(this.creature, attribute, 1);
          return true;
        }
      });
      if (changed.length) server.broadcastPartialCreatureUpdate(this.creature, changed);
    }

    if (!this.goals.length && this.creature.eatGrass) {
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

    let attackSkill = Content.getSkillByNameOrThrowError('Unarmed Attack');
    const weapon = this.creature.equipment && this.creature.equipment[Container.EQUIP_SLOTS.Weapon];
    const weaponMeta = weapon ? Content.getMetaItem(weapon.type) : null;
    if (weaponMeta) {
      if (weaponMeta.combatSkill !== undefined) {
        const skill = Content.getSkill(weaponMeta.combatSkill);
        if (skill) attackSkill = skill;
      } else if (weaponMeta.class === 'Wand' && this.currentSpell) {
        attackSkill = Content.getSkill(this.currentSpell.skill);
      }
    }

    const attackType = attackSkill?.purpose || 'melee';
    if (attackType === 'magic' && !this.currentSpell) {
      return;
    }

    let minRange = 0;
    let maxRange = 1;
    if (attackType === 'magic') {
      maxRange = this.currentSpell?.range || 1;
    } else {
      minRange = weaponMeta?.minRange || 0;
      maxRange = weaponMeta?.maxRange || 1;
    }

    let defenseSkill = Content.getSkillByNameOrThrowError('Melee Defense');
    if (attackType === 'magic') defenseSkill = Content.getSkillByNameOrThrowError('Magic Defense');
    if (attackType === 'missle') defenseSkill = Content.getSkillByNameOrThrowError('Missle Defense');

    let lineOfSight = false;
    if (attackType === 'missle' || attackType === 'magic') lineOfSight = true;

    let successAnimationName = 'Attack';
    if (attackType === 'magic' && this.currentSpell?.animation) {
      successAnimationName = Content.getAnimationByIndex(this.currentSpell.animation - 1).name;
    }

    let successProjectileAnimationName;
    if (attackType === 'missle') successProjectileAnimationName = 'Arrow';
    if (attackType === 'magic' && this.currentSpell?.projectileAnimation) {
      successProjectileAnimationName = Content.getAnimationByIndex(this.currentSpell.projectileAnimation - 1).name;
    }

    let damage = 0;
    if (attackType === 'magic') {
      // TODO: should just set damage to 0 and allow this to
      // go thru the 'data.spell' flow.
      if (this.currentSpell?.life && this.currentSpell.life < 0) {
        const variance = Utils.randInt(this.currentSpell.variance || 0, this.currentSpell.variance || 0);
        damage = -this.currentSpell.life + variance;
      }
    } else {
      damage = Utils.randInt(this.creature.stats.damageLow, this.creature.stats.damageHigh);
    }

    let attackAttributeCost = 1;
    if (attackType === 'magic' && this.currentSpell) attackAttributeCost = this.currentSpell.mana;

    const attackSpeed = attackType === 'magic' && this.currentSpell ?
      this.currentSpell.castTime :
      this.creature.stats.attackSpeed;
    this.ticksUntilNextAttack = server.taskRunner.rateToTicks({ seconds: attackSpeed });

    let spell = this.currentSpell;
    let isFriendly = false;
    if (damage === 0 && attackType === 'magic' && spell) {
      const keys = ['life', 'intelligence', 'wisdom', 'dexterity', 'quickness', 'hero', 'strength'] as const;
      isFriendly = keys.every((key) => (spell?.[key] || 0) >= 0);
    }
    if (!isFriendly) spell = undefined;

    const missReason = server.handleAttack({
      actor: this.creature,
      damage,
      canBeBlocked: !isFriendly,
      attackAttributeCost,
      attackSkill,
      weapon: weapon ?? undefined,
      spell: attackType === 'magic' ? spell : undefined,
      minRange,
      maxRange,
      lineOfSight,
      target: this.targetCreature.creature,
      defenseSkill,
      successAnimationName,
      successProjectileAnimationName,
    });

    if (!missReason || missReason === 'blocked') {
      if (!isFriendly && damage && this.targetCreature && !this.targetCreature.enemyCreatures.includes(this)) {
        this.targetCreature.enemyCreatures.push(this);
      }

      // TODO: regeneration for each attribute. only reset timer if that attribute was consumed.
      this.resetRegenerationTimer(server);
      if (this.targetCreature) {
        this.targetCreature.resetRegenerationTimer(server);
      }
    }

    // Only keep doing the same spell if it does damage.
    if (attackType === 'magic' && this.currentSpell && !(this.currentSpell.life && this.currentSpell.life < 0)) {
      this.currentSpell = undefined;
      this.targetCreature = null;
      const clientConnection = server.getClientConnectionForCreature(this.creature);
      if (clientConnection) clientConnection.sendEvent(EventBuilder.setAttackTarget({ creatureId: null }));
    }
  }
}
