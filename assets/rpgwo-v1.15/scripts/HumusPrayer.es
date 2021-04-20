; pray1.es

; listen for players prayers

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Dim ChatTag1
Dim ChatTag2

Dim UUID

Dim Karma
Dim Gawd

Dim PlayerGawd

Dim TempleX
Dim TempleY
Dim TempleZ

Dim ItemTag


Dim MonsterID
Dim KarmaNeeded
Dim KarmaCost


Dim X1
Dim Y1
Dim Z1

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Begin

   MaxLineCount 200

   Let TempleX = 793
   Let TempleY = 485
   Let TempleZ = 0

   Let Gawd = 1

   Let ChatTag1 = GetFreeTag()
   Let ChatTag2 = GetFreeTag()

   RecordChatOn 1000, 1000, 0, 1000, ChatTag1
   RecordChatOn 1000, 1000, 1, 1000, ChatTag2

:Loop1

   Wait 3

   IfPlayerChat ChatTag1, Humus Prayer, @PrayerList
   IfPlayerChat ChatTag2, Humus Prayer, @PrayerList

;   IfPlayerChat ChatTag1, Serve Humus, @AcceptPlayer
;   IfPlayerChat ChatTag2, Serve Humus, @AcceptPlayer

   IfPlayerChat ChatTag1, Humus Warp Me, @WarpMe
   IfPlayerChat ChatTag2, Humus Warp Me, @WarpMe

   IfPlayerChat ChatTag1, Humus Create Food, @CreateFood
   IfPlayerChat ChatTag2, Humus Create Food, @CreateFood

   IfPlayerChat ChatTag1, Humus Summon Skeleton, @SummonSkeleton
   IfPlayerChat ChatTag2, Humus Summon Skeleton, @SummonSkeleton

   IfPlayerChat ChatTag1, Humus Summon Ghost, @SummonGhost
   IfPlayerChat ChatTag2, Humus Summon Ghost, @SummonGhost

   IfPlayerChat ChatTag1, Humus Summon Wraith, @SummonWraith
   IfPlayerChat ChatTag2, Humus Summon Wraith, @SummonWraith

   IfPlayerChat ChatTag1, Humus Summon Corrupt Soul, @SummonCorruptSoul
   IfPlayerChat ChatTag2, Humus Summon Corrupt Soul, @SummonCorruptSoul

   IfPlayerChat ChatTag1, Humus Summon Guardian, @SummonGuardian
   IfPlayerChat ChatTag2, Humus Summon Guardian, @SummonGuardian

   IfPlayerChat ChatTag1, Humus Summon Screamer, @SummonScreamer
   IfPlayerChat ChatTag2, Humus Summon Screamer, @SummonScreamer

   IfPlayerChat ChatTag1, Humus Summon Bone Gorvor, @SummonBoneGorvor
   IfPlayerChat ChatTag2, Humus Summon Bone Gorvor, @SummonBoneGorvor

   IfPlayerChat ChatTag1, Humus Poison, @Poison
   IfPlayerChat ChatTag2, Humus Poison, @Poison

   IfPlayerChat ChatTag1, Humus Turn Undead, @TurnUndead
   IfPlayerChat ChatTag2, Humus Turn Undead, @TurnUndead

   IfPlayerChat ChatTag1, Humus Raise Vitae, @RaiseVitae
   IfPlayerChat ChatTag2, Humus Raise Vitae, @RaiseVitae

   RecordChatReset ChatTag1
   RecordChatReset ChatTag2

   Goto Loop1

End

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub PrayerList

   Let UUID = GetChatUUID()

   SendMessage UUID, Humus Prayer List:

   SendMessage UUID, - Humus Warp Me (50 Karma - Warps player to temple)

   SendMessage UUID, - Humus Create Food (20 Karma - Gives player some food)

   SendMessage UUID, - Humus Summon Skeleton (30 Karma)

   SendMessage UUID, - Humus Summon Ghost (50 Karma)

   SendMessage UUID, - Humus Summon Wraith (90 Karma)

   SendMessage UUID, - Humus Summon Corrupt Soul (150 Karma)

   SendMessage UUID, - Humus Summon Guardian (225 Karma)

   SendMessage UUID, - Humus Summon Screamer (300 Karma)

   SendMessage UUID, - Humus Summon Bone Gorvor (400 Karma)

   SendMessage UUID, - Humus Poison (50 Karma)

   SendMessage UUID, - Humus Turn Undead (20 Karma)

   SendMessage UUID, - Humus Raise Vitae (1000 Karma - Raises Vitae by 1%% to MAX 100%%)  

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub WarpMe

   Let UUID = GetChatUUID()

   PlayerGawd UUID, PlayerGawd

   IfEquals PlayerGawd, Gawd, WarpMe_GawdOK

   SendMessage UUID, Humus is not your gawd!

   Return

:WarpMe_GawdOK

   PlayerKarma UUID, Karma

   IfLess Karma, 50, WarpMe_Less

   ; ok, do it

   KarmaAdd UUID, -50
   
   WarpPlayer UUID, TempleX, TempleY, TempleZ

   SendMessage UUID, You say a prayer and ... POOF!

   Return

:WarpMe_Less

   SendMessage GetChatUUID(), That prayer requires 50 karma!

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub CreateFood

   Let UUID = GetChatUUID()

   PlayerGawd UUID, PlayerGawd

   IfEquals PlayerGawd, Gawd, CreateFood_GawdOK

   SendMessage UUID, Humus is not your gawd!

   Return

:CreateFood_GawdOK

   PlayerKarma UUID, Karma

   IfLess Karma, 20, CreateFood_Less

   ; ok, do it

   KarmaAdd UUID, -20

   Let ItemTag = GetFreeTag()
   
   ItemAdd Cooked Leg of Cow, 1, 1, 1, 1, ItemTag   

   ItemGive Itemtag, UUID

   SendMessage UUID, You say a prayer and ... POOF!

   Return

:CreateFood_Less

   SendMessage GetChatUUID(), That prayer requires 20 karma!

EndSub


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub SummonSkeleton

; skills 60

   Let MonsterID = 99
   Let KarmaNeeded = 30
   Let KarmaCost = -30

   Gosub SummonMonster

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub SummonGhost

; skills 100

   Let MonsterID = 72
   Let KarmaNeeded = 50
   Let KarmaCost = -50

   Gosub SummonMonster

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub SummonWraith

; skills 175

   Let MonsterID = 24
   Let KarmaNeeded = 90
   Let KarmaCost = -90

   Gosub SummonMonster

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub SummonCorruptSoul

; skills 300

   Let MonsterID = 150
   Let KarmaNeeded = 150
   Let KarmaCost = -150

   Gosub SummonMonster

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub SummonGuardian

; skills 450

   Let MonsterID = 40
   Let KarmaNeeded = 225
   Let KarmaCost = -225

   Gosub SummonMonster

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub SummonScreamer

; skills 600

   Let MonsterID = 95
   Let KarmaNeeded = 300
   Let KarmaCost = -300

   Gosub SummonMonster

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub SummonBoneGorvor
    
; skills 800

   Let MonsterID = 691
   Let KarmaNeeded = 400
   Let KarmaCost = -400

   Gosub SummonMonster

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;


Sub SummonMonster

   Let UUID = GetChatUUID()

   PlayerGawd UUID, PlayerGawd

   IfEquals PlayerGawd, Gawd, SummonMonster_GawdOK

   SendMessage UUID, Humus is not your gawd!

   Return

:SummonMonster_GawdOK

   PlayerKarma UUID, Karma

   IfLess Karma, KarmaNeeded, SummonMonster_Less

   ; ok, do it

   KarmaAdd UUID, KarmaCost
   
   GiveTame UUID, MonsterID, 0
;   GiveTame UUID, MonsterID, 0
;   GiveTame UUID, MonsterID, 0

   SendMessage UUID, You say a prayer and ... POOF!

   Return

:SummonMonster_Less

   SendMessage GetChatUUID(), That prayer requires %KarmaNeeded% karma!

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub Poison

   Let UUID = GetChatUUID()

   PlayerGawd UUID, PlayerGawd

   IfEquals PlayerGawd, Gawd, Poison_GawdOK

   SendMessage UUID, Humus is not your gawd!

   Return

:Poison_GawdOK

   PlayerKarma UUID, Karma

   IfLess Karma, 50, Poison_Less

   KarmaAdd UUID, -50

   PlayerLocation UUID, X1, Y1, Z1
   
   AreaEffect 4, X1, Y1, Z1, 5, 4, 50, 11

   SendMessage UUID, You say a prayer and ... POOF! Poison!

   Return

:Poison_Less

   SendMessage GetChatUUID(), That prayer requires 50 karma!

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub TurnUndead

   Let UUID = GetChatUUID()

   PlayerGawd UUID, PlayerGawd

   IfEquals PlayerGawd, Gawd, TurnUndead_GawdOK

   SendMessage UUID, Humus is not your gawd!

   Return

:TurnUndead_GawdOK

   PlayerKarma UUID, Karma

   IfLess Karma, 20, TurnUndead_Less

   KarmaAdd UUID, -20

   PlayerLocation UUID, X1, Y1, Z1
   
   AreaEffect 4, X1, Y1, Z1, 5, 3, 0, 18

   SendMessage UUID, You say a prayer and ... POOF! Turn Undead!

   Return

:TurnUndead_Less

   SendMessage GetChatUUID(), That prayer requires 20 karma!

EndSub


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub RaiseVitae

   Let UUID = GetChatUUID()

   PlayerGawd UUID, PlayerGawd

   IfEquals PlayerGawd, Gawd, RaiseVitae_GawdOK

   SendMessage UUID, Humus is not your gawd!

   Return

:RaiseVitae_GawdOK

   PlayerKarma UUID, Karma

   IfLess Karma, 1000, RaiseVitae_Less

   KarmaAdd UUID, -1000

   Vitae UUID, 1

   SendMessage UUID, You say a prayer and ... POOF!

   Return

:RaiseVitae_Less

   SendMessage GetChatUUID(), That prayer requires 1000 karma!

EndSub


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Sub AcceptPlayer

   Let UUID = GetChatUUID()

   SetPlayerGawd UUID, 1   

; zero out their karma
   PlayerKarma UUID, Karma

   Let Karma = 0 - Karma

   KarmaAdd UUID, Karma


   SendMessage UUID, You now serve Humus.

EndSub

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
