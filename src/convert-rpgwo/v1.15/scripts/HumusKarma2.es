; Humuskarma.es

; give karma to players using scrolls

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Dim X1
Dim Y1

Dim Karma

Dim UUID
Dim Gawd

Dim GawdID

Dim Tag

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Begin

   Let Tag = GetFreeTag()

   Let X1 = 793
   Let Y1 = 488

   Let GawdID = 1

:loop1

   IfItemIdAt 2164, X1, Y1, 0, 0, @Scroll1

   IfItemIdAt 2165, X1, Y1, 0, 0, @Scroll2

   IfItemIdAt 2166, X1, Y1, 0, 0, @Scroll3

   IfItemIdAt 2167, X1, Y1, 0, 0, @Scroll4

   IfItemIdAt 2168, X1, Y1, 0, 0, @Scroll5

   Wait 1

   Goto loop1

End

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub GiveKarma

   IfPlayerNear X1, Y1, 0, 1, Player1

   Return

:Player1

   Let UUID = GetNearestPlayer()

   PlayerGawd UUID, Gawd

   IfEquals Gawd, GawdID, Player2

   Return

:Player2

   KarmaAdd UUID, Karma

   ItemAdd Blazing Inferno, x1, y1, 0, 1, tag, 1

   Wait 1

   itemRemove Tag

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub Scroll1

   Let karma = 50

   GoSub GiveKarma

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub Scroll2

   Let karma = 100

   GoSub GiveKarma

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub Scroll3

   Let karma = 150

   GoSub GiveKarma

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub Scroll4

   Let karma = 200

   GoSub GiveKarma

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub Scroll5

   Let karma = 250

   GoSub GiveKarma

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;