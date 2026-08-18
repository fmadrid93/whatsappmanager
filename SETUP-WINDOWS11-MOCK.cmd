@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path . -Recurse -File | Unblock-File; & '.\scripts\windows-native\setup-windows11-local.ps1' -Mode Mock -StartAfterSetup"
pause
