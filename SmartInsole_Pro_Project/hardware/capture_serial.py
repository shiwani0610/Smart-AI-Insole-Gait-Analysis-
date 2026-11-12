"""Record the ESP32 CSV serial stream as a timestamped CSV for SmartInsole.
Requires: python -m pip install pyserial
Usage: python capture_serial.py --list
       python capture_serial.py --port /dev/cu.usbserial-0001 --duration 30
       python capture_serial.py --port COM5 --duration 30
The dashboard imports the resulting CSV; it does not pretend this is a live link.
"""
import argparse
import csv
from pathlib import Path
import time
try:
    import serial
    from serial.tools import list_ports
except ImportError:
    raise SystemExit("Missing pyserial. Install with: python -m pip install pyserial")
HEADERS = ['time_s','heel','midfoot','toe','ax','ay','az','gx','gy','gz']
parser=argparse.ArgumentParser(description='Capture SmartInsole ESP32 serial readings to CSV')
parser.add_argument('--list',action='store_true',help='List available ports')
parser.add_argument('--port',help='ESP32 USB port, e.g. /dev/cu.usbserial-0001 or COM5')
parser.add_argument('--baud',type=int,default=115200)
parser.add_argument('--duration',type=float,default=30,help='Recording duration in seconds; 0 means until Ctrl+C')
parser.add_argument('--out',default='recorded_sensor_readings.csv')
a=parser.parse_args()
if a.list:
    ports=list(list_ports.comports())
    for p in ports: print(f'{p.device}: {p.description}')
    if not ports: print('No ports found. Check USB cable / USB drivers / power.')
    raise SystemExit(0)
if not a.port: parser.error('Specify --port; see --list')
path=Path(a.out).expanduser().resolve();path.parent.mkdir(parents=True,exist_ok=True)
n=0;skipped=0
print(f'Opening {a.port} at {a.baud}. Close Arduino Serial Monitor first.')
try:
    with serial.Serial(a.port,a.baud,timeout=1) as device, path.open('w',newline='',encoding='utf-8') as f:
        writer=csv.writer(f);writer.writerow(HEADERS)
        start=time.monotonic()
        while a.duration<=0 or time.monotonic()-start<a.duration:
            raw=device.readline().decode('utf-8',errors='replace').strip()
            if not raw or raw.lower().startswith('time_s'): continue
            parts=[v.strip() for v in raw.split(',')]
            if len(parts)<10:
                skipped+=1
                if skipped<=5: print('Skipped unexpected serial line:',raw[:120])
                continue
            try:
                vals=[float(x) for x in parts[:10]]
            except ValueError:
                skipped+=1
                continue
            writer.writerow([f'{vals[0]:.3f}']+[f'{v:.0f}' for v in vals[1:]])
            n+=1
            if n%100==0: print(f'Recorded {n} samples...')
except KeyboardInterrupt:
    print('\nStopped by user.')
except serial.SerialException as err:
    raise SystemExit(f'Serial connection error: {err}')
print(f'Done: {n} readings, {skipped} skipped. CSV: {path}')
print('Open SmartInsole dashboard > Gait analysis lab > Import CSV.')
