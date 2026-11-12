# SmartInsole AI — LIVE ESP32 USB Dashboard

## Read this first
This edition adds **direct live ESP32 sensor input**. Unlike the older CSV-only version, the dashboard automatically receives new sensor readings when launched using `START_LIVE_MAC.command` or `START_LIVE_WINDOWS.bat`.

**What has been verified:** The user's ESP32 was shown producing 10-column Serial Monitor data at **115200 baud**, and their Python recorder saved **1,201 valid rows**. The new Python serial bridge was tested with a controlled virtual serial feed; browser cards, charts, event detection, synthetic-trained ML and exports were tested with a simulated stream. The physical ESP32-to-new-live-dashboard end-to-end path still needs confirmation on the user's Mac. No clinical validation is claimed.

## Run on the user's Mac — about six steps

1. Extract the ZIP completely. Keep the `js`, `css`, `training`, and `hardware` folders together with `index.html` and `live_server.py`.
2. Plug in the **actual ESP32** USB data cable. Your screenshot showed port `/dev/cu.usbserial-A5069RR4`. Don't remove your existing firmware; it already printed the needed 10-column serial rows.
3. **Close Arduino Serial Monitor** and stop the old `capture_serial.py` recorder. Only one process can own the serial port.
4. Open Terminal in this extracted `SmartInsole_Pro_Project` folder. Run:

   ```bash
   bash START_LIVE_MAC.command
   ```

   Python 3 is required. On macOS and Linux, the server has a built-in POSIX serial fallback even if `pyserial` is unavailable. (If you already ran the old recorder, `pyserial` is likely installed.)
5. The script starts the local serial bridge and usually opens the browser automatically at **http://127.0.0.1:8765/index.html**. If it does not, open that exact link manually in Chrome. **Do not double-click `index.html` for live mode**; that opens only the offline fallback.
6. Click sidebar **Live ESP32 USB**. Confirm status **LIVE ESP32 CONNECTED**, sample count increasing and raw serial rows changing. When auto-detect fails, choose port `/dev/cu.usbserial-A5069RR4` from the USB port dropdown and click **Connect port**. If a different port name is present, select that one instead.

## Test the sensors

- Press heel FSR: `HEEL · RAW ADC` should change.
- Press midfoot/toe FSRs separately: their respective ADC values should change.
- Tilt MPU6050: accel and gyro values should change.
- Keep the insole still for around two seconds, then click **Calibrate idle baseline** before attempting to calculate contact events.
- Create repeated, distinct pressure-on/pressure-off contacts **safely**. Only walk with a securely attached insole and wiring that does not create a trip hazard.
- Wait for at least **four complete contacts**. Gait analysis and synthetic-trained ML will show a class only if enough foot-contact and pressure progression features are present. A stable standing signal may correctly show **insufficient signal**.
- Click **Export live CSV** to download the real streaming measurements directly from the bridge. **Save analysis session** for computed features and **Reports & compare** for analysis CSV and baseline.

## Exact incoming serial data format

Your Arduino firmware's current 10 numeric columns:

```
time_s,heel,midfoot,toe,ax,ay,az,gx,gy,gz
18.410,817,510,339,-1412,972,17068,-303,-83,-123
```

The local bridge also accepts older 14-column sensor rows and JSON lines with named fields. Rate about **40 Hz**, baud **115200**. It ignores text headers and reports invalid lines in `SKIPPED`.

## Architecture

```
FSR heel/midfoot/toe + MPU6050
             |
       ESP32 DevKit
             | USB 115200 numeric rows
       live_server.py (Python)
             | HTTP Server-Sent Events (SSE)
http://127.0.0.1:8765/index.html
             | Real raw FSR/IMU values + charts
             | Idle baseline correction and gait events
             | Synthetic-trained Random Forest ML
             + CSV export + baseline + saved reports
```

Everything is hosted **only on 127.0.0.1**. Your sensor stream is not uploaded to a cloud service by this program.

## Other launch options

- On Windows, install Python 3 and use `START_LIVE_WINDOWS.bat` (installs `pyserial` if missing), choose your actual COM port if auto-detect fails.
- Manual Mac command: `python3 live_server.py --port /dev/cu.usbserial-A5069RR4 --baud 115200`.
- Browser after server starts: `http://127.0.0.1:8765/index.html`.
- Test software with replay (clearly marked **TEST REPLAY, NOT HARDWARE**): `python3 live_server.py --replay data/steady_sensor_recording.csv`. **Never represent replay as real ESP32 sensor readings.**
- `index.html` opened as a file works only in offline demo/CSV fallback mode, without a live serial bridge.

## Troubleshooting

| Symptom | Action |
|---|---|
| `PORT OPEN / WAITING DATA` | Verify Arduino is actually printing 10-column rows at 115200 and board hasn't restarted |
| `ESP32 NOT CONNECTED` | Close Serial Monitor, stop Python recorder, connect USB, choose the correct port, click Connect port |
| `Address already in use` | Close previous live_server Terminal window or stop its process before starting again |
| LIVE count grows, FSR stays constant | Test pressing each sensor in Arduino Serial Monitor; check voltage dividers, ground and FSR calibration |
| MPU axes all zero | Check MPU6050 power and SDA/SCL connections (21/22 for standard ESP32 DevKit) |
| LIVE count grows but no cadence | The sensor variation / repeated foot-contact events are insufficient; calibrate idle and safely generate cycles |
| Data appears only as DEMO | You're using `file://index.html` rather than the local `http://127.0.0.1:8765/index.html` |
| Model shows `Insufficient gait features` | It requires ≥4 detected contact events, timing variability and heel-to-toe data; no prediction is invented |

## Gait/ML limitations (judge-safe)

1. FSR ADC levels (0–4095) are uncalibrated; the visual pressure map shows **relative readings**.
2. Idle subtraction is a simple heuristic; thresholds may need tuning for the user's physical sensors.
3. Same-foot cycle cadence estimate assumes alternating steps, approximately 120 ÷ cycle duration in seconds.
4. The saved Random Forest was trained on 440 **synthetic, algorithm-generated examples** using 36 trees. The synthetic test split cannot establish real-world accuracy or clinical diagnosis capability.
5. A single insole cannot measure left-versus-right gait symmetry; no disease predictions are made.
6. Physical end-to-end validation of this *newly connected* live bridge must be carried out on the ESP32 laptop before demonstrating it to judges.

## Files

- `index.html` — responsive 8-page dashboard with **LIVE ESP32 USB** page.
- `css/style.css`, `js/analysis.js`, `js/app.js`, `js/ml_model.js`, `js/ml_inference.js` — graphics, algorithms and trained inference.
- `live_server.py` — real USB serial acquisition + Server-Sent Events server, local only.
- `START_LIVE_MAC.command`, `START_LIVE_WINDOWS.bat` — launchers.
- `hardware/SmartInsole_ESP32_CSV.ino` — existing 10-column Arduino firmware; keep it if already working.
- `hardware/capture_serial.py` — optional fallback CSV recorder.
- `training/smartinsole_synthetic_random_forest.joblib` — trained model artifact.
- `presentation/SmartInsole_LIVE_ESP32_10_Slide_Viva.pptx` — 10-slide updated deck.
- `presentation/SmartInsole_LIVE_ESP32_10_Slide_Viva.pdf` — matching slides as PDF.
- `presentation/SmartInsole_LIVE_Team_Speech_and_Viva_Guide.pdf` — separate full speaking script and viva Q&A.
