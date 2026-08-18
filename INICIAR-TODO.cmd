@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIAR-TODO.ps1"
if errorlevel 1 (
  echo.
  echo El inicio fallo. Revisa el mensaje anterior y los logs en logs\development.
  pause
)
