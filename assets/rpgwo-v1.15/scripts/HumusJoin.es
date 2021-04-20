; HumusJoin.es

; joining humus followers

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Dim State

Dim Count

Dim UUID

Dim Gawd

Dim karma

Dim Time1

Dim JoinXpos
Dim JoinYpos
Dim JoinZpos

Dim CenterXpos
Dim CenterYpos
Dim CenterZpos

Dim StartXpos
Dim StartYpos
Dim StartZpos

Dim EndXpos
Dim EndYpos
Dim EndZpos

Dim ExitXpos
Dim ExitYpos
Dim ExitZpos

Dim JoinChatTag

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Begin

   MaxLineCount 200

;   Log True

   Let State = 1

   let JoinChatTag = GetFreeTag()

;   Let JoinXpos = 50
;   Let JoinYpos = 50
;   Let JoinZpos = 0

;   Let CenterXpos = 90
;   Let CenterYpos = 90
;   Let CenterZpos = 1

;   Let StartXpos = 85
;   Let StartYpos = 85
;   Let StartZpos = 1

;   Let EndXpos = 100
;   Let EndYpos = 100
;   Let EndZpos = 1

;   Let ExitXpos = 50
;   Let ExitYpos = 45
;   Let ExitZpos = 0

   Let JoinXpos = 784
   Let JoinYpos = 483
   Let JoinZpos = 0

   Let CenterXpos = 1110
   Let CenterYpos = 510
   Let CenterZpos = 1

   Let StartXpos = 1102
   Let StartYpos = 502
   Let StartZpos = 1

   Let EndXpos = 1101
   Let EndYpos = 516
   Let EndZpos = 1

   Let ExitXpos = 793
   Let ExitYpos = 475
   Let ExitZpos = 0


:Loop1   

   IfEquals State, 1, @State1

   IfEquals State, 2, @State2

   IfEquals State, 3, @State3

   Goto Loop1

End

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub State1

   ; waiting for a player

   RecordChatOn joinxpos, joinypos, joinzpos, 0, joinchattag
      
:State1_Loop1

   Wait 1

   IfPlayerChat joinchattag, Humus Join, State1_Join

   GoSub ClearPlayers

   Goto State1_Loop1

:State1_Join

   Let UUID = GetChatUUID()

   RecordChatOff JoinChatTag

   PlayerGawd uuid, Gawd

   ifequals Gawd, 0, State1_OK

   SendMessage uuid, Sorry/, you already have a gawd.

   Return

:State1_OK

   Let State = 2 

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub ClearPlayers

:ClearPlayers_Loop1

   IfNotPlayerNear Centerxpos, Centerypos, Centerzpos, 11, ClearPlayers_Exit

   WarpPlayer GetNearestPlayer(), ExitXpos, ExitYpos, ExitZpos
   
   Goto ClearPlayers_Loop1
   
:ClearPlayers_Exit

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub State2

;   GoSub ClearPlayers

   ; player is in

   WarpPlayer UUID, StartXpos, Startypos, Startzpos

   SendMessage uuid, Your test to become a Humus follower has begun!

   Let Count = 30

   RecordChatOn joinxpos, joinypos, joinzpos, 0, joinchattag
      
:State2_Loop1

   Wait 1

   IfPlayerNear Endxpos, Endypos, Endzpos, 0, State2_Near

   Let Count = Count - 1

   ifEquals Count, 0, State2_Timeout   

;   Let Time1 = Count ^ 3
   let time1 = count * 20

   SendMessage UUID, You have %time1% seconds left to pass the test.

   Goto State2_Loop1

:State2_Timeout

   SendMessage uuid, You have run out of time and failed your test!

;   GoSub ClearPlayers
   WarpPlayer UUID, ExitXpos, Exitypos, Exitzpos

   Let UUID = 0

   Let State = 1

   Return

:State2_Near

   Let State = 3

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub State3

   ; player passed

   SetPlayerGawd uuid, 1

   SendMessage UUID, You have passed the test and are now a Humus follower!

   PlayerKarma UUID, Karma

   Let Karma = 0 - Karma

   KarmaAdd UUID, Karma

;   GoSub ClearPlayers
   WarpPlayer UUID, ExitXpos, Exitypos, Exitzpos

   Let UUID = 0

   Let State = 1

   Wait 3

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
