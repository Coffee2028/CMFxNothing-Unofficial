@echo off
title Nothing Ear Web Controller
echo ---------------------------------------
echo   STARTING NOTHING EAR (WEB) APP
echo ---------------------------------------
cd web

if not exist node_modules (
    echo [INFO] First run detected. Installing dependencies...
    call npm install
)

echo [INFO] Launching Development Server...
call npm run dev
pause
