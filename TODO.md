* Persist settings to local storage
* "Reset" button for settings
* Max item stacks
* trash can
* selected tool + space (with no selected view) should use the item on tile below player.

____

* Stamina / Health
* Inventory system
* Better online networking
* Merchants
* Registration
* Use item attributes to build usage system
* * ex: Instead of defining a usage for Axe + (4 stages of banana tree), Axe + (4 stages of apple tree), ... mark each of those items as an "Tree" and define Axes to tear down trees

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

# Art

Come up with an artsyle. I like this: https://imgur.com/r/pixelart/kNFhhpW 16x16 tiles, but tiles can be slightly taller.
Simplify things. Don't need so many "grass" floors.
Player character is animated, up/down/left/right perspectives. Monsters are just a single front perspective, or maybe left/right.
Floor terrain transitions.
Fix the inventory / toolbar in one spot.

# Environment

* Day / Night
* Line of sight
* Rooftops https://www.youtube.com/watch?v=SEpFCazng7o
* Personal islands? like AC.
* Warp -> see preview of destination.

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

# Misc / ideas

Question: Carry hot soup through town, deliver.

Pick up materials (gems, silk, wood). In order to use, costs environment points (flora, fauna, earth). Study a tree -> get flora. 

Can't dig down unless you own the land.
