@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path . -Recurse -File | Unblock-File; & '.\scripts\windows-native\configure-environment.ps1' -Mode Mock -SqlServerHost localhost -SqlServerInstance SQLEXPRESS -OpenEnv"
pause
