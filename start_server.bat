@echo off
:: Tacey Collections Local Server Launcher (Windows)

echo Starting Stacey's Shop Server...
echo Opening browser at http://localhost:8080...
start http://localhost:8080

:: Run python server
python -m http.server 8080

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Python is not running or not installed on your system.
    echo Please make sure Python is installed and added to your PATH environment variable.
    pause
)
