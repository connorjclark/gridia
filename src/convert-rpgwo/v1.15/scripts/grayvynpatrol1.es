; grayvynpatrol#.es

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Dim X1
Dim Y1

Dim DestX
Dim DestY

Dim Tag

Dim Count

Dim State

Dim SubState

Dim Xpos
Dim Ypos
Dim Zpos

Dim X2
Dim Y2

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Begin

   Let X1 = 400
   Let Y1 = 200
  
   Let Tag = GetFreeTag() 

   Let State = 1   
   Let SubState = 1

:Loop1

   IfEquals State, 1, @State1

   IfEquals State, 2, @State2     

   Goto Loop1

End

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub State1

   IfEquals SubState, 1, @add1
   
   IfEquals SubState, 2, @add2

   IfEquals SubState, 3, @add3

   MonsterChat tag, Let's go hunt fer dem humans...

   Let State = 2

   Let SubState = SubState + 1

   IfEquals SubState, 4, State1_Overflow

   Return

:State1_Overflow
 
   Let SubState = 1

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub Add1

   MonsterAdd Grayvyn Archer, X1, Y1, 0, 4, Tag
   MonsterAdd Grayvyn Hound, X1, Y1, 0, 4, Tag

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub Add2

   MonsterAdd Grayvyn Crossbowman, X1, Y1, 0, 4, Tag
   MonsterAdd Grayvyn Warmonger, X1, Y1, 0, 4, Tag

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub Add3

   MonsterAdd Grayvyn Ranger, X1, Y1, 0, 4, Tag
   MonsterAdd Grayvyn Buzzard, X1, Y1, 0, 4, Tag

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub State2

   MonsterLocation tag, xpos, ypos, zpos

   MinRnd 0
   MaxRnd 40

   Let X2 = rnd() - 20
   Let Y2 = rnd() - 20

   Let X2 = Xpos + X2
   Let Y2 = Ypos + Y2

   MonsterGoto tag, X2, Y2

   Let Count = 15

:State2_Loop1

   Wait 1

   IfNotMonsterExist tag, State2_Dead

   IfMonsterAT tag, X2, Y2, 4, State2_Goal

   MonsterLocation tag, xpos, ypos, zpos

   IfPlayerNear xpos, ypos, zpos, 5, State2_Human

   Let Count = Count - 1

   IfEquals Count, 0, State2_Timeout

   Goto State2_loop1

:State2_Human

   Monsterchat tag, Human spotted! Take no prisoners!!!

   Goto State2_Loop1

:State2_TimeOut

   Return

:State2_Dead

   Let State = 1

   Return

:State2_Goal

   MonsterChat Tag, No humans here. Let's try over there...

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
