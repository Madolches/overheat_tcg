@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-webhook.ps1"
exit /b %ERRORLEVEL%
