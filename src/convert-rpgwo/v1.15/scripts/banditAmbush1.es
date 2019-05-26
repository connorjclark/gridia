; bandit ambush

Dim X1
Dim Y1

dim Tag1

begin

;Let X1 = 1527
;let Y1 = 1102

Let X1 = 170
let Y1 = 170


Let tag1 = getfreetag()

Title Bandit Ambush

:start1

IfPlayerNear x1, y1, 5, ambush

Wait 1

goto start1

;;;;;;;;;;;;;;;;

:ambush

Global Some bandits have sprung an ambush on an unsuspecting traveler!

MonsterAdd Bandit, x1, y1+5, 0, 2, tag1
MonsterAdd Bandit mage, x1, y1+5, 0, 2, tag1
MonsterAdd Bandit archer, x1, y1+5, 0, 2, tag1

MonsterAdd Bandit, x1, y1-5, 0, 2, tag1
MonsterAdd Bandit mage, x1, y1-5, 0, 2, tag1
MonsterAdd Bandit archer, x1, y1-5, 0, 2, tag1

MonsterChat tag1, Ambush!!!!! Kill the lout and rob his corpse!!



;;;;;;;;;;;;;;;;;;

:Attack

Wait 1

IfNotMonsterExist tag1, victory1

IfNotPlayerNear x1, y1, 10, victory2

goto attack

;;;;;;;;;;;;;;;;;;

:victory1

Global A bandit ambush has been thwarted!!

wait 40

goto start1

;;;;;;;;;;;;;;;;;;

:victory2

Global A bandit ambush was successful!

MonsterChat tag1, Another victom to host our foul greed!

MonsterRemove tag1

wait 40

goto start1


