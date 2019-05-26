; grayvyn ambush

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Dim State

Dim X1
Dim Y1

Dim Xmin
Dim Xmax
Dim Ymin
Dim Ymax

Dim Count

Dim Tag1

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Begin

   Let Xmin = 400
   Let Xmax = 600
   Let Ymin = 200
   Let Ymax = 400

   Let tag1 = getfreetag()

   Let State = 1

:Start

   IfEquals State, 1, @State1

   IfEquals State, 2, @State2

   IfEquals State, 3, @State3
   
   Goto Start

End

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub State1
   ; get new location

   MinRnd Xmin
   MaxRnd Xmax

   Let X1 = RND()

   MinRnd Ymin
   MaxRnd Ymax

   Let Y1 = RND()

   Let State = 2

;   Title Ambush setup at %x1%, %y1%

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub State2
   ; waiting for prey
 
   ; 30 minutes
   Let Count = 90

:State2Begin

   IfPlayerNear X1, Y1, 0, 10, State2Ambush
   
   Let Count = Count - 1

   IfEquals Count, 0, State2Abort

   Wait 1

   Goto State2Begin

:State2Abort

   Let State = 1

   Return

:State2Ambush

   Let State = 3

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub State3
   ; ambush!

   MonsterAdd Grayvyn Soldier, X1 + 10, Y1 + 10, 0, 1, Tag1
   MonsterAdd Grayvyn Soldier, X1 + 10, Y1 - 10, 0, 1, Tag1
   MonsterAdd Grayvyn Soldier, X1 - 10, Y1 + 10, 0, 1, Tag1
   MonsterAdd Grayvyn Soldier, X1 - 10, Y1 - 10, 0, 1, Tag1

   MonsterAdd Grayvyn Hound, X1 + 10, Y1, 0, 1, Tag1
   MonsterAdd Grayvyn Hound, X1, Y1 + 10, 0, 1, Tag1
   MonsterAdd Grayvyn Hound, X1 - 10, Y1, 0, 1, Tag1
   MonsterAdd Grayvyn Hound, X1, Y1 - 10, 0, 1, Tag1

   MonsterGoto Tag1, X1, Y1

   Monsterchat Tag1, Kill the human!!!

;   LocalChat X1, Y1, 0, 15, Grayvyn Ambush!

   Let Count = 15

:State3Begin

   IfNotMonsterExist Tag1, State3Failed
   
   Let Count = Count - 1

   IfEquals Count, 0, State3Abort

   Wait 1

   Goto State3Begin

:State3Abort

   MonsterRemove Tag1

   Wait 1

   Let State = 2

   Return

:State3Failed

   Global Players thwarted a Grayvyn ambush!

   Wait 1

   Let State = 1

   Return

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;