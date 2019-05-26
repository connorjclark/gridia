; addrose.es

; monitors and adds oil wells when needed

; This script WILL give warnings about exceeding the line count.
; The warnings can be safely ignored or you can raise the MaxLineCount.
; But it might cause lag when adding oil wells since it is about 12*100
; lines being executed to add the full 100 oil wells.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Dim ItemCount

Dim X1
Dim Y1

Dim Owner

Dim Count

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

Begin

   MaxLineCount 2500

   MinRnd 10

; change maxRnd to your map size minus 10!!!
   MaxRnd 1990

:Loop1

   Let Count = Count + 1

   IfGreater Count, 1000, DoIt_Exit

   Let X1 = Rnd()
   Let Y1 = Rnd()

   LandOwner X1, Y1, Owner

   IfEquals Owner, 0, DoIt_OK

   Let Count = Count - 1

   Goto Loop1

:DoIt_OK

   ItemAdd Short Orange Rose Bush, X1, Y1, 0, 1, 0

   Goto Loop1

:Doit_Exit

   sendmessage 31, Adding Orange done

End

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

