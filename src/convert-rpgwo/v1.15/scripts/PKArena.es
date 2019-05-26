; pkarena.es


Dim ChatTag1

Dim Xpos
Dim Ypos

Begin

   Let ChatTag1 = GetFreeTag()

   RecordChatOn 158, 1830, 0, 2, ChatTag1

:Loop1

   Wait 3

   IfPlayerChat ChatTag1, Death Before Disco, DOWarp

   RecordChatReset ChatTag1

   Goto Loop1

:DoWarp

   MaxRnd 18
   MinRnd 2

   ; add player

   Let Xpos = 10 - Rnd() 
   Let Ypos = 10 - Rnd() 
 
   Let Xpos = 170 + Xpos 
   Let Ypos = 1830 + Ypos 

   WarpPlayer GetChatUUID(), Xpos, Ypos, 0

   RecordChatReset ChatTag1

   Goto Loop1

End
