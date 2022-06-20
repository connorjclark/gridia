* a11y
* More performant saving.
* "Reset" button for settings
* trash can
* selected tool + space (with no selected view) should use the item on tile below player.
* Writing on signs
* Show stats on View
* in-range indicator
* path finding on server
* improve quest state
* align server clock with real clock (so a duration of ~10m would happen at 1:00, 1:10, 1:20, ...)
* dialogue
  - options with requirements (Show but crossed out)


____

* Use item attributes to build usage system
* * ex: Instead of defining a usage for Axe + (4 stages of banana tree), Axe + (4 stages of apple tree), ... mark each of those items as an "Tree" and define Axes to tear down trees

# Game Overview

Start in a large boat. You've left your home country and gave up everything you had
to book passage on a ship destined for a far away land, XX.

Part I: Tutorial area

- start in ship cabin. short intro.

- Find captain.

You: Hey Captain. Wondering when we'll reach XX. We must be close, yeah?
Captain: Aye. The winds have been good to us. We should be arriving shortly.
         In the meantime, my crew sure could do with something to eat. I think
         the cook has drunk himself into a coma again. Why don't you fill the
         time before our arrival by seeing what sort of food you can cook up?
Y: Food? You want me to cook? I'm not sure that's a good idea...
C: Oh sure it is. These men will eat just about anything. Just go down below
   to the kitchen and see what you can do. I have a feeling that by the time
   you return, we'll be just arriving.
Y: Alright.

Quest: Make enough food to feed the crew. 0 / 5 food.

- You find the cook passed out in the corner, and some uncooked ribs. You work
  out how to turn on the oven with the fire starter, try to cook some ribs, but
  burn everything.
- Encounter rats down below, on way to kitchen. Easy kills. Drops rat tails and
  meat.
- Overhear mysterious conversation (see next section).
- Player has better luck cooking rat meat. 50/50 success.
- After 5 successful cooks, head back to the captain.

P: Here's that food you ordered. Hey, listen, this might be a little...
C: Ratty?
P: Basically.
C: Say no more. In fact, say that you whipped up the finest beef on the ship,
   a meal suitted for a king. When out at sea, often the best meal comes from
   one's imagination.
P: Listen, I heard something strange down below from other passengers... it sounded
   like something criminal.
C: Oh? I'm sure it's nothing. Besides, it's a poor living for a captain who locks
   up his fare paying passengers.
P: If you say so... Anyway, have we arrived?
C: As a matter of fact, yes! I suppose you'll be leaving in a hurry. I'm often in
   need of extra hands around here. Once you're settled in, stop by the docks and
   maybe I'll have some work for you. Good pay, and good food!
P: Barf... Alright.
C: land ho!

Misc notes:
- 100x100 map
- A weird crewmate will buy rat tails for 1 gold each.
- Dolphins/other water creatures can be seen outside the ship on the water.

Main story line:

- On the ship, you over hear two mysterious passengers discussing something intensely,
  but you're unclear what exactly they are saying. You make something out about the governor
  and his daughter. It sounds like they are in danger.
- Upon arriving in XX, when you attempt to visit the governor you are stopped by his staff. He
  is much too busy to see you. Normally, he loves entertaining new arrivals. But recently he has
  been holed up in his quarters dealing with important matters.
- The daughter runs up to the staff and tells him that her father is asking for them. They hurry off,
  then the daughter asks if you just arrived by the ship. Before you can finish saying "Yes", she
  shushes you, saying "Not here. It isn't safe." She scrawls something down on a peice of paper, hands
  it to you and runs off. She pauses for a moment, turns back and says "Bring something sharp." before
  disappearing into a different room.
- The note reads: "Can't talk here. Don't know who to trust. Meet me in the sewers underground. I'll
  be waiting where the tunnels connect to the Governor's mansion."
- This kicks off the first part of the main quest line: navigating through the city's tunnels, and   
  leveling up enough to make it all the way through.

Eng work:
* In map gen, be able to copy the contents of one map to another.
* Quest log
* Scripting
* NPC conversation
* Player-specific world state, such as: a door, creature, etc...
* Player characters shouldn't block each other.
* Combat (duh)



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

Ultima IV has moon gates, portals linking parts of the world that go on/off based on the phase of the moon.

This is cool: https://www.angelfire.com/super/rummager/ fireplace.

Quest the involves surving keelhauling? good swim stat / stamina potions or something.
