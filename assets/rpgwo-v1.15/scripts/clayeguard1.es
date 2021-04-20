;; caste gaurd around the it

;;;;;;;;;;;;;;;;;;

Dim X1
Dim Y1

Dim X2
Dim Y2

Dim Tag1

begin

;Let X1 = 1289
;Let Y1 = 470

;Let X2 = 1332
;Let Y2 = 512

Let X1 = 455
Let Y1 = 455

Let X2 = 544
Let Y2 = 544

Let Tag1 = GetFreeTag()

;;;;;;;;;;;;;;;;;;;

Title Claye Street Gaurds

;Global With recent raids of bandits, King Mickey has ordered a patrol of gaurds to walk the streets of Kastleton.

;;;;;;;;;;;;;;;;;;;

:Start1

MonsterAdd Castle Guard, x1, y1, 0, 4, tag1

:Leg1

IfNotMonsterExist tag1, death1

MonsterGoto tag1, x1, y2

Wait 4

IfNotMonsterAt tag1, x1, y2, 5, leg1

MonsterChat tag1, All clear.

:Leg2

IfNotMonsterExist tag1, death1

MonsterGoto tag1, x2, y2

Wait 4

IfNotMonsterAt tag1, x2, y2, 5, leg2

MonsterChat tag1, All clear.

:Leg3

IfNotMonsterExist tag1, death1

MonsterGoto tag1, x2, y1

Wait 4

IfNotMonsterAt tag1, x2, y1, 5, leg3

MonsterChat tag1, All clear.

:Leg4

IfNotMonsterExist tag1, death1

MonsterGoto tag1, x1, y1

Wait 4

IfNotMonsterAt tag1, x1, y1, 5, leg4

MonsterChat tag1, All clear.

Goto leg1

;;;;;;;;;;;;;;;;;

:death1

Global The Claye street gaurds have been killed!

Wait 20

goto start1

;;;;;;;;;;;;;;;;;
