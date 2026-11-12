#!/bin/bash
cd "$(dirname "$0")"
echo "========================================"
echo " SMARTINSOLE AI - LIVE ESP32 (MAC)"
echo "========================================"
echo "Close Arduino IDE Serial Monitor before starting."
echo "Using your previously detected port, if still available."
python3 live_server.py --baud 115200
read -p 'Press Enter to close'
