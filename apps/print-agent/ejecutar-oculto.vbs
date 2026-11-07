' Lanza el agente de impresion SIN ventana y lo vuelve a iniciar si se cae.
' (Lo usa el inicio automatico de Windows; no hace falta abrirlo a mano.)
Option Explicit
Dim sh, fso, dir, rc
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
Do
    rc = sh.Run("cmd /c node agent.js", 0, True)
    ' 0 = se detuvo a proposito, 3 = ya habia otro agente corriendo
    If rc = 0 Or rc = 3 Then Exit Do
    WScript.Sleep 15000
Loop
