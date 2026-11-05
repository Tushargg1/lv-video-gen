@echo off
title AI Influencer Studio Web Dashboard (Port 3002)
color 0a

echo ========================================================
echo   Launching AI Influencer Web Dashboard on Port 3002
echo ========================================================
echo.
cd /d %~dp0nextjs-poster
npm run dev:3002
pause
