; GetKarma1.es

; gives karma to players


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Dim X1
Dim Y1
Dim Z1

Dim ChatTag

Dim Gawd

Dim PlayerGawd
Dim PLayerKarma

Dim GawdUUID
Dim UUID

Dim Count

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Begin

;   Log TRUE

   Let X1 = 489
   Let y1 = 431
;   Let X1 = 100
;   Let Y1 = 100
   Let Z1 = 0

   Let Gawd = 1
   Let GawdUUID = 25251

   Let ChatTag = getFreeTag()

   RecordChatOn X1, Y1, Z1, 0, ChatTag

:Loop1

   Wait 3

   IfPlayerChat ChatTag, Worship Humus, @Pray

   Goto Loop1

End

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub Pray

   Let UUID = GetChatUUID()

   PlayerGawd UUID, PlayerGawd

   IfEquals PlayerGawd, Gawd, Pray_GawdOK

   SendMessage UUID, Humus is not your gawd!

   RecordChatReset ChatTag

   Return

:Pray_GawdOK

   KarmaAdd UUID, 10
   KarmaAdd GawdUUID, 20

   SendMessage UUID, You worship Humus and earn 10 karma!

   Animation X1, Y1, Z1, 7

;   Gosub Rest

   PlayerKarma UUID, PlayerKarma
   IfGreater PlayerKarma, 5000, @Nerf

   RecordChatOff ChatTag

   Wait 3

   RecordChatOn X1, Y1, Z1, 0, ChatTag

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub Nerf
   
   Let PlayerKarma = 1000 - PlayerKarma

   KarmaAdd UUID, PlayerKarma   

   SendMessage UUID, Your karma has been nerfed!
  
EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;


Sub Rest

   Let Count = 3

   RecordChatReset ChatTag

:Rest_Loop1

   let UUID = 0

   Wait 1

   IfPlayerChat ChatTag, Humus, @NotReady

   ifgreater UUID, 0, Rest_Loop1

   Let Count = Count - 1

   IfEquals Count, 0, Rest_Exit

   Goto Rest_Loop1

:Rest_Exit

   RecordChatReset ChatTAg

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub NotReady

   Let UUID = GetChatUUID()

   SendMessage UUID, Humus is not answering your worship.

   RecordChatReset ChatTAg
 
EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;


