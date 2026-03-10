@echo off
title Echo Forge Loop
color 0B
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0LAUNCH.ps1"
pause
