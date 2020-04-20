* Stamina / Health
* Inventory system
* Better online networking
* Better rendering
* Merchants
* Wear images
* Registration
* Link to help.md on GH in game.

# Combat

Tab to enable combat mode
Click to engage
100ms ticks

# UI

* good for inspiration: https://www.youtube.com/watch?v=X2EN8kmIkzA
* Modal input? ie: normal mode is item usage, press Tab to enter combat mode
* dbl click to engage in combat
* hide names unless click on creature
* hover to show grey / blue highlight on enemy (neutral / good)

# Environment

* Day / Night
* Line of sight
* Rooftops https://www.youtube.com/watch?v=SEpFCazng7o

# Code health

* map name / serverDir

# AI

GOAP: http://alumni.media.mit.edu/~jorkin/goap.html

Cow
Goal: ReduceHunger
Priority: 10
Goal: Wander
Priority: 1

Action: EatGrass
P: on grass
E: -hunger

Action: FindGrass
P: none
E: on grass


Goblin
Goal: KillCreature
Priority: 10

Action: MeleeAttack
P: near creature
E: KillCreature

Attack villager, they pick up nearby sword.
  Make AttackUnarmed higher cost than AttackArmed + PickupWeapon
Startle room of goblins, they run to grab various weapons and attack.
