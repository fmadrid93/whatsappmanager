@echo off
cd /d "%~dp0"
echo Ejecuta este archivo como Administrador.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\windows-native\deploy-windows-server.ps1" -IisPort 80 -ForceIis -StartServices
pause
