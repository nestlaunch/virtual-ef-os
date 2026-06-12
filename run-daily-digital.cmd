@echo off
setlocal

cd /d "%~dp0"

echo Starting Daily Digital...
echo.
echo User page:  http://127.0.0.1:5173/
echo Admin page: http://127.0.0.1:5173/admin
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C to stop the app.
echo.

npm.cmd run dev -- --host 127.0.0.1 --port 5173

echo.
echo Daily Digital stopped.
pause
