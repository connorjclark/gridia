import {WATER} from '../constants.js';
import * as Container from '../container.js';
import * as Content from '../content.js';
import {Context} from '../context.js';
import {findPath} from '../path-finding.js';
import * as EventBuilder from '../protocol/event-builder.js';
import * as Utils from '../utils.js';
import {WorldMapPartition} from '../world-map-partition.js';

import {ClientConnection} from './client-connection.js';
import {adjustAttribute} from './creature-utils.js';
import {aStar} from './plan.js';
import {Server} from './server.js';

// State that clients don't need and shouldn't have.
// Also isn't serialized - this state is transient.

export interface Goal {
  desiredEffect: string;
  priority: number;
  doNotRetry?: boolean;
  satisfied(this: CreatureState, server: Server): boolean;
  onDone?(this: CreatureState): void;
}

export interface Action {
  name: string;
  cost: number;
  preconditions: string[];
  /**
   * Effects that will (potentially) become true if this action is taken.
   * If an effect corresponds to a fact (see Facts), then the action will
   * likely do logic that result in the Fact logic eventually returning true.
   * If there is no associated Fact callback, then the effect is "fake" and
   * is only used to force the plan creation to use this fact (see "wander").
   */
  effects: string[];
  /**
   * Used to determine if this action is immedietly applicable. If returns false,
   * then some other goal's plan will be attempted first.
   */
  isAvailable?(this: CreatureState): boolean;
  /**
   * If returns:
   * - true: action completed successfully, move on to next action
   * - false: action cannot complete, replan how to reach goal
   * - void: maintain action for another tick
   */
  tick?(this: CreatureState, server: Server): boolean | void;
}

type Fact = (this: CreatureState, server: Server) => boolean;

const isGrass = (floor: number) => floor >= 110 && floor < 300;

const Facts: Record<string, Fact> = {
  'on-grass'(server) {
    return isGrass(server.context.map.getTile(this.creature.pos).floor);
  },
  'too-close-target'(server) {
    // TODO: This overloading feels wrong.
    let creatureToFollow = this.targetCreature?.creature;
    if (this.creature.tamedBy) {
      const tamedByPlayer = server.context.players.get(this.creature.tamedBy);
      if (tamedByPlayer){
        creatureToFollow = server.findCreatureForPlayer(tamedByPlayer);
      }
    }
    if (!creatureToFollow) return false;

    return Utils.maxDiff(this.creature.pos, creatureToFollow.pos) < this.getFollowRange().minRange;
  },
  'too-far-target'(server) {
    // TODO: This overloading feels wrong.
    let creatureToFollow = this.targetCreature?.creature;
    if (this.creature.tamedBy) {
      const tamedByPlayer = server.context.players.get(this.creature.tamedBy);
      if (tamedByPlayer){
        creatureToFollow = server.findCreatureForPlayer(tamedByPlayer);
      }
    }
    if (!creatureToFollow) return false;

    return Utils.maxDiff(this.creature.pos, creatureToFollow.pos) > this.getFollowRange().maxRange;
  },
  'near-target'(server) {
    return !Facts['too-close-target'].call(this, server) && !Facts['too-far-target'].call(this, server);
  },
  'hidden-from-target'(server) {
    if (!this.targetCreature) return false;

    // TODO: actually use target LOS and attack range
    return Utils.maxDiff(this.creature.pos, this.targetCreature.creature.pos) >= 7;
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
    isAvailable() {
      return this.targetCreature === null;
    },
    tick() {
      // Just wander baby.
      if (this.path.length) return;

      const randomDest = {...this.creature.pos};
      randomDest.x += Utils.randInt(-1, 1) * 3;
      randomDest.y += Utils.randInt(-1, 1) * 3;
      // TODO: use creature.roam to anchor to home.
      this.goto(randomDest);
    },
  },
  AttackTarget: {
    name: 'AttackTarget',
    cost: 10,
    preconditions: ['near-target'],
    effects: ['kill-creature'],
    isAvailable() {
      return this.canAttackAgain();
    },
    tick(server) {
      if (this.creature.magicChances?.length) {
        const val = Utils.randInt(0, 100);
        let spellIdChosen;
        let sumSoFar = 0;
        for (const {spellId, chance} of this.creature.magicChances) {
          sumSoFar += chance;
          if (val < sumSoFar) {
            spellIdChosen = spellId;
            break;
          }
        }

        if (spellIdChosen !== undefined) {
          this.currentSpell = Content.getSpell(spellIdChosen);
        }
      }

      if (this.currentSpell) {
        if (this.currentSpell.target === 'other') {
          this._handleAttack(server, true);
        } else {
          // TODO: send message to attacking player ?
          // TODO: don't do heal if already full health...
          const failed = !!server.castSpell(this.currentSpell, this.creature, this.creature, this.creature.pos);
          if (failed) this._handleAttack(server);
        }
      } else {
        this._handleAttack(server);
      }

      this._handleAttack(server);
      this.currentSpell = undefined;
    },
  },
  EvadeTarget: {
    name: 'EvadeTarget',
    cost: 5,
    preconditions: [],
    effects: ['hidden-from-target'],
    tick() {
      const targetCreature = this.targetCreature?.creature;
      if (!targetCreature) return false;

      const dir = Utils.direction(targetCreature.pos, this.creature.pos);
      const dest = {...this.creature.pos};
      if (dir.x) dest.x += Math.sign(dir.x);
      if (dir.y) dest.y += Math.sign(dir.y);
      this.goto(dest);
    },
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
        if (tamedByPlayer){
          creatureToFollow = server.findCreatureForPlayer(tamedByPlayer);
        }
      }

      if (!creatureToFollow) return false;
      if (creatureToFollow.pos.w !== this.creature.pos.w) return false;
      // TODO: Follow through stairs.
      if (creatureToFollow.pos.z !== this.creature.pos.z) return false;

      this.goto(creatureToFollow.pos);
      this.idle(server, 2000); // Throttle how often pathfinding runs.

      if (this.path.length === 0 || this.path.length >= 20) {
        this.targetCreature = null;
        this.resetGoals();
        return false;
      }
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
      const pos = server.findNearest({pos: this.creature.pos, range: 8}, true,
        (tile, l) => server.context.walkable(l) && isGrass(tile.floor));
      if (pos) {
        this.goto(pos);
        return;
      }

      // Else just move somewhere else.
      const randomDest = {...this.creature.pos};
      randomDest.x += Utils.randInt(-1, 1) * 8;
      randomDest.y += Utils.randInt(-1, 1) * 8;
      this.goto(randomDest);
    },
  },
};

export class CreatureState {
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

  // @ts-expect-error
  partition: WorldMapPartition;
  private ticksUntilNotIdle = 0;
  private ticksUntilNextMovement = 0;
  private ticksUntilNextAttack = 0;
  private ticksUntilRegeneration = 0;

  // GOAP
  private _actions: Action[];
  /** Sorted by highest priority first. */
  private goals: Goal[] = [];
  private goalActionPlans: Map<Goal, {shouldRecreate: boolean; createdAt: number; actions: Action[]}> = new Map();

  private _shouldRecreatePlan = false;

  constructor(public creature: Creature, private context: Context) {
    this.home = creature.pos;
    this._actions = [
      Actions.AttackTarget,
      Actions.FollowTarget,
    ];

    // TODO: this only allows ranged monsters to evade ...
    // otherwise melee monsters will always run way too far away in combat.
    // Instead, maybe tune "EvadeTarget" action?
    const weapon = this.creature.equipment?.[Container.EQUIP_SLOTS.Weapon];
    let maxRange = 1;
    if (weapon) {
      const meta = Content.getMetaItem(weapon.type);
      if (meta.maxRange !== undefined) maxRange = meta.maxRange;
    }
    if (maxRange > 5) {
      this._actions.push(Actions.EvadeTarget);
    }

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
    // TODO: try to not call this so much
    this.path = findPath(this.context, this.partition, this.creature.pos, destination);
  }

  idle(server: Server, time: number) {
    this.ticksUntilNotIdle = server.taskRunner.rateToTicks({ms: time});
  }

  canAttackAgain() {
    return this.ticksUntilNextAttack === 0;
  }

  resetGoals() {
    this.goals = [];
    this.path = [];
    this._shouldRecreatePlan = true;
  }

  addGoal(newGoal: Goal) {
    for (const goal of this.goals) {
      if (goal.desiredEffect === newGoal.desiredEffect) {
        if (goal.priority !== newGoal.priority) {
          goal.priority = newGoal.priority;
          this._shouldRecreatePlan = true; // TODO why?
        }
        return;
      }
    }

    this.goals.push(newGoal);
    this.goals.sort((a, b) => b.priority - a.priority);
  }

  removeGoal(goal: Goal) {
    const index = this.goals.indexOf(goal);
    if (index !== undefined) {
      this.goals.splice(index, 1);
      this.goalActionPlans.delete(goal);
      if (goal.onDone) goal.onDone.call(this);
    }
  }

  learnAction(action: Action) {
    if (!this._actions.find((a) => a.name === action.name)) this._actions.push(action);
  }

  resetRegenerationTimer(server: Server) {
    this.ticksUntilRegeneration = server.taskRunner.rateToTicks({seconds: 5});
  }

  tick(server: Server) {
    if (this.currentSpell?.target !== 'other') this.currentSpell = undefined;
    if (this.ticksUntilNextAttack > 0) this.ticksUntilNextAttack--;
    if (this.ticksUntilNextMovement > 0) this.ticksUntilNextMovement--;
    if (this.ticksUntilNotIdle > 0) this.ticksUntilNotIdle--;
    if (this.ticksUntilRegeneration > 0) this.ticksUntilRegeneration--;

    if (this.ticksUntilRegeneration === 0 && server.context.map.getTile(this.creature.pos).floor !== WATER) {
      this.ticksUntilRegeneration = server.taskRunner.rateToTicks({seconds: 2});
      const changed = (['stamina', 'mana'] as const).filter((attribute) => {
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
      const tamedByPlayer = server.context.players.get(this.creature.tamedBy);
      this.addGoal({
        desiredEffect: 'near-target',
        priority: 50,
        satisfied() {
          if (!tamedByPlayer) return true;
          const clientConnection = server.getClientConnectionForPlayer(tamedByPlayer);
          if (!clientConnection) return true;
          return Utils.maxDiff(this.creature.pos, clientConnection.creature.pos) <= 2;
        },
      });
    }

    const currentFacts = new Map<string, boolean>();
    const testFact = (factName: string) => {
      let isFact = currentFacts.get(factName);
      if (isFact === undefined) {
        if (Facts[factName]) {
          isFact = Facts[factName].call(this, server);
        } else {
          // Not all facts are "real" (like wander).
          isFact = false;
        }
      }

      currentFacts.set(factName, isFact);
      return isFact;
    };

    for (const goal of this.goals) {
      if (goal.satisfied.call(this, server)) {
        this.removeGoal(goal);
      }
    }

    if (this.creature.isPlayer) {
      // Constantly try to attack if player. For monsters, this is only called if
      // in the AttackTarget state.
      this._handleAttack(server, !!this.currentSpell);
      return;
    }

    this._createPlan(server);
    this._handleMovement(server);

    // Target the closest enemy.
    if (this.enemyCreatures.length && !this.targetCreature) {
      let closestEnemy: CreatureState | null = null;
      let closestDist = Number.MAX_VALUE;
      for (const enemy of this.enemyCreatures) {
        if (!enemy) continue;
        if (enemy.creature.pos.w !== this.creature.pos.w) continue;

        const dist = Utils.dist(enemy.creature.pos, this.creature.pos);
        // TODO: LOS
        if (dist >= 20) continue;

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
        this.addGoal({
          desiredEffect: 'hidden-from-target',
          priority: 90,
          // TODO: LOS
          satisfied: () => closestEnemy ? closestEnemy.creature.life.current <= 0 : true,
        });
      }
    }

    if (this.ticksUntilNotIdle > 0) return;
    if (!this.goalActionPlans.size) return;
    if (!this.goals.length) return;

    this.partition = server.context.map.getPartition(this.creature.pos.w);

    // Find an action for the highest priority goal that can be done now.
    let currentGoal;
    let currentPlan;
    let currentAction;
    for (const goal of this.goals) {
      const plan = this.goalActionPlans.get(goal);
      if (!plan) continue; // Shouldn't happen.
      if (plan.actions.length === 0) continue;

      const action = plan.actions[plan.actions.length - 1];
      if (action.isAvailable && !action.isAvailable.call(this)) continue;
      if (!action.preconditions.every(testFact)) {
        plan.shouldRecreate = true;
        continue;
      }

      currentGoal = goal;
      currentPlan = plan;
      currentAction = action;
      break;
    }

    if (!currentAction || !currentGoal || !currentPlan) {
      this._shouldRecreatePlan = true;
      return;
    }

    if (!currentAction.tick) return;

    const result = currentAction.tick.call(this, server);
    if (result) {
      this.goalActionPlans.get(currentGoal)?.actions.pop();
    } else if (result === false) {
      if (currentGoal.doNotRetry) {
        this.removeGoal(currentGoal);
      } else {
        currentPlan.shouldRecreate = true;
      }
    } else {
      // Stop action if all effects are fulfilled.
      currentFacts.clear();
      if (currentAction.effects.every(testFact)) {
        this.goalActionPlans.get(currentGoal)?.actions.pop();
        this.path = [];
      }
    }
  }

  getFollowRange() {
    if (this.creature.tamedBy) {
      return {
        minRange: 2,
        maxRange: 2,
      };
    }

    const weapon = this.creature.equipment?.[Container.EQUIP_SLOTS.Weapon];
    let minRange = 1;
    let maxRange = 1;
    if (weapon) {
      const meta = Content.getMetaItem(weapon.type);
      if (meta.minRange !== undefined) minRange = meta.minRange;
      if (meta.maxRange !== undefined) maxRange = meta.maxRange;
    } else {
      for (const {spellId} of this.creature.magicChances || []) {
        const spell = Content.getSpell(spellId);
        if (spell.target === 'other') {
          maxRange = Math.max(maxRange, spell.range);
        }
      }
    }

    return {
      minRange,
      maxRange,
    };
  }

  respondToCreatureRemoval(creature: Creature) {
    if (this.targetCreature?.creature === creature) {
      this.targetCreature = null;
    }

    const index = this.enemyCreatures.findIndex((enemy) => enemy.creature === creature);
    if (index !== -1) this.enemyCreatures.splice(index, 1);
  }

  private _createPlanForGoal(server: Server, goal: Goal, initialState: string[]) {
    const actions = this._actions;
    const desiredState = [goal.desiredEffect];

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
      // TODO: potential source of wasted cpu? if a goal cannot be completed may want to
      // mark it 'impossible' and not try again for X seconds.
      return;
    }

    const plannedActions: Action[] = result.path.map((p: any) => p.edge && p.edge.action).filter(Boolean).reverse();
    this.goalActionPlans.set(goal, {
      shouldRecreate: false,
      actions: plannedActions,
      createdAt: server.context.time.epoch,
    });
    // console.log(goal.desiredEffect, goal.priority, plannedActions.map((a) => a.name).reverse());
  }

  private _createPlan(server: Server) {
    if (this._shouldRecreatePlan) {
      this._shouldRecreatePlan = false;
      this.goalActionPlans = new Map();
      this.ticksUntilNotIdle = 0;
      this.path = [];
    }

    // If no goals, there's nothing to do.
    if (!this.goals.length) return;

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

    for (const goal of this.goals) {
      const plan = this.goalActionPlans.get(goal);
      if (!plan || plan.shouldRecreate || plan.actions.length === 0) {
        this._createPlanForGoal(server, goal, initialState);
      }
    }
  }

  private _handleMovement(server: Server) {
    if (this.ticksUntilNextMovement > 0) return;

    const durationThresholds = [400, 750, 1000, 1500, 3500, 5000];
    const durationInMs = durationThresholds[Utils.clamp(this.creature.speed, 0, durationThresholds.length)];
    this.ticksUntilNextMovement = server.taskRunner.rateToTicks({ms: durationInMs});

    if (this.path.length) {
      const newPos = {w: this.creature.pos.w, ...this.path.splice(0, 1)[0]};
      if (this.context.walkable(newPos)) {
        server.moveCreature(this.creature, newPos);
      } else {
        // Path has been obstructed - reset pathing.
        this.path = [];
      }
    }
  }

  _handleAttack(server: Server, forceSpell = false) {
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

    const attackType = forceSpell ? 'magic' : (attackSkill?.purpose || 'melee');
    if (attackType === 'magic') {
      if (this.currentSpell) {
        attackSkill = Content.getSkill(this.currentSpell.skill);
      } else {
        return;
      }
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

    let projectileAnimationName;
    if (attackType === 'missle') projectileAnimationName = 'Arrow';
    if (attackType === 'magic' && this.currentSpell?.projectileAnimation) {
      projectileAnimationName = Content.getAnimationByIndex(this.currentSpell.projectileAnimation - 1).name;
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
    this.ticksUntilNextAttack = server.taskRunner.rateToTicks({seconds: attackSpeed});

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
      projectileAnimationName,
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
      if (clientConnection) clientConnection.sendEvent(EventBuilder.setAttackTarget({creatureId: null}));
    }
  }
}
