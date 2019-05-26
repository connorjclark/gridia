; humusquit.es


Dim ChatTag

Dim Xpos
Dim Ypos
Dim Zpos

Dim UUID

Dim PlayerGawd

;;;;;;;;;;;;

Begin

   Let Xpos = 791
   Let Ypos = 493
   Let Zpos = 0

   Let ChatTag = GetFreeTag()  

   RecordChatOn xpos, ypos, zpos, 1, ChatTag

:Loop1

   IfPlayerChat ChatTag, Humus Quit, Humus_Quit

   Wait 1

   Goto Loop1

:Humus_Quit

   Let UUID = GetChatUUID()

   PlayerGawd UUID, PlayerGawd

   IfEquals 1, PlayerGawd, Quit_GawdOK

   SendMessage UUID, Humus is not your gawd!

   RecordChatReset ChatTag

   Goto Loop1

:Quit_GawdOK

   SetPlayerGawd UUID, 0

   Vitae UUID, -3   

   SendMEssage UUID, You are no longer a Humus follower.

   RecordChatReset ChatTag
   
   Goto Loop1

End