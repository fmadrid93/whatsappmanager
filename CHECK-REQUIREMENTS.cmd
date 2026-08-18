@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path . -Recurse -File | Unblock-File; & '.\scripts\windows-native\check-requirements.ps1'"
pause
