@echo off
setlocal

cd /d "%~dp0"

echo Starting DodgeMissile dev servers...
echo.
echo Server: ws://localhost:8080
echo Client: http://localhost:5173
echo Mobile: use the Network URL shown in the client window, usually http://192.168.x.x:5173
echo.

start "DodgeMissile Server" cmd /k "cd /d "%~dp0server" && npm.cmd run dev"
start "DodgeMissile Client" cmd /k "cd /d "%~dp0client" && npm.cmd run dev"

echo Open http://localhost:5173 on this PC.
echo For mobile, connect to the same Wi-Fi and open the 192.168.x.x:5173 address shown by Vite.
echo.
pause
