; temple1.es

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Dim X1
Dim Y1

Dim Gawd
Dim Playergawd

Dim UUID

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Begin

   Let X1 = 793
   Let Y1 = 480

   Let Gawd = 1

:Loop1

   IfPlayerNear X1, Y1, 0, 0, @state1 

   Wait 1

   Goto Loop1

End

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub State1

   Let UUID = GetNearestPlayer()

   Playergawd UUID, PlayerGAwd

   IfEquals PlayerGAwd, gawd, State1_OK

   WarpPlayer UUID, 793, 476

   return

:State1_OK

   WarpPlayer UUID, 793, 485

   SendMessage UUID, Welcome to the Temple of Humus!   

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;