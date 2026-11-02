Option Explicit

Dim shell, fileSystem, scriptDirectory, powershellScript, command

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
powershellScript = fileSystem.BuildPath(scriptDirectory, "start-fpl-app.ps1")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & powershellScript & """"

' Window style 0 keeps PowerShell completely hidden. The PowerShell launcher
' starts Next.js, waits until localhost is ready, and then opens the browser.
shell.Run command, 0, False
