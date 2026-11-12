# Optional physical ESP32 hookup & CSV capture

The dashboard works **without hardware** using simulated demos, or **with recorded CSV** from a real hardware session. **Direct live ESP32-to-browser streaming has not been verified** in this project. CSV capture is the supported integration route here.

## Sample wiring (ESP32 DevKit; check actual board pin labels)

| Component | Connection |
|--|--|
| Heel FSR | Voltage-divider output -> GPIO 34 |
| Midfoot FSR | Voltage-divider output -> GPIO 35 |
| Toe FSR | Voltage-divider output -> GPIO 32 |
| Each FSR divider | 3.3V -> FSR -> ADC junction -> 10kΩ resistor -> GND |
| MPU6050 | VCC -> 3V3; GND -> GND; SDA -> GPIO21; SCL -> GPIO22 |
| ESP32 | USB data cable to laptop |

**Never connect 5V straight to ESP32 ADC or I2C GPIO pins.** Use common ground, secure wires, and verify voltage divider connections. The typical MPU6050 I2C address is `0x68` (AD0 low). Sensor board pinouts and required power may differ.

## Setup
1. Arduino IDE -> install ESP32 board support, select your ESP32 board and actual USB port.
2. Open `SmartInsole_ESP32_CSV.ino`, upload it.
3. Open Serial Monitor at 115200 baud and verify output begins with `time_s,heel,midfoot,toe,ax,ay,az,gx,gy,gz`. Press heel, midfoot, and toe to verify each respective ADC number moves.
4. **Close Serial Monitor** before running Python capture; only one program can open a serial port at once.
5. Run `python -m pip install pyserial` once, then `python capture_serial.py --list` to find the USB port.
6. Record a 30-second walk: `python capture_serial.py --port /dev/cu.usbserial-0001 --duration 30 --out walk1.csv` (Mac) or `python capture_serial.py --port COM5 --duration 30 --out walk1.csv` (Windows). Replace port with the one you found.
7. Open `index.html` in Chrome -> **Gait analysis lab -> Import CSV** -> select `walk1.csv`. Save a baseline and compare another recording.

## Troubleshooting
- No port: replace charging-only cable with data USB cable; check board/driver.
- CSV sample count zero: ensure firmware actually prints CSV at 115200, not diagnostic text.
- FSR values stuck zero: check voltage divider, resistor, and actual pin mapping; test one sensor before three.
- MPU6050 values zero: verify SDA/SCL and 0x68 or 0x69 address.
- Gait events missing: need repeated walking contact cycles with correct timestamps and changing FSR signals.
- Model labels on real recordings are **exploratory only** until trained/tested on real human gait data with appropriate ground-truth labels.
