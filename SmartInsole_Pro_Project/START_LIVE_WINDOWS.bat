@echo off
cd /d "%~dp0"
python -c "import serial" >nul 2>&1 || python -m pip install pyserial
python live_server.py --baud 115200
pause
