# Trained machine-learning model and dashboard connection

## Already connected - no configuration needed

The project contains a **real trained RandomForestClassifier** created using Python and scikit-learn. It has **36 trees** and uses **440 algorithm-generated synthetic recordings** (220 steady-like, 220 irregular-like). The algorithm uses 10 features extracted from gait-sensor sample sequences:

1. estimated cadence; 2. same-foot cycle duration; 3. stance percentage; 4. rhythm consistency index; 5. timing coefficient of variation; 6. heel-to-toe progression; 7-9. heel, midfoot, toe shares; 10. count of heuristic flags.

The Python model is saved as `smartinsole_synthetic_random_forest.joblib`. The Python training script also **exports all trained tree thresholds and leaf scores** into `js/ml_model.js`. The browser script `js/ml_inference.js` runs those trees directly and displays a `synthetic steady-like` or `synthetic irregular-like` class score. **You do NOT need to run a Python backend to see the model output.** Keep the `js` folder when using `index.html`, or use the included self-contained single-file HTML.

## Run the dashboard

1. For LIVE ESP32, launch `START_LIVE_MAC.command` and open `http://127.0.0.1:8765/index.html`. Opening `index.html` directly only enables the offline fallback.
2. Go to **Gait analysis lab**. The model panel shows `RANDOM FOREST - 36 TREES`.
3. Click **Steady demo** or **Irregular demo** to see synthetic examples with different gait properties.
4. For recorded data, click **Import sensor CSV** and select a file like `data/steady_sensor_recording.csv`. The same analysis pipeline processes it.
5. Save a session or export report.

## Reproduce training

Requirements: Python 3.10+, Node.js, `numpy`, `scikit-learn`, `joblib`.

```bash
cd SmartInsole_Pro_Project
python -m pip install -r training/requirements.txt
python training/train_model.py
```

The script regenerates synthetic examples, retrains the model, replaces `training/smartinsole_synthetic_random_forest.joblib` and `js/ml_model.js`, and writes `training/synthetic_model_evaluation.json`. Refresh the dashboard after retraining.

**Measured synthetic-only holdout result:** 110 synthetic test examples, all correctly classified within the artificial generator distribution. This is **NOT** measured accuracy for real humans, physical sensors, abnormal clinical gait or disease.

## Connect physical ESP32 recordings

For a working acquisition route, upload `hardware/SmartInsole_ESP32_CSV.ino` to your ESP32, then use `hardware/capture_serial.py` to save serial output into a proper CSV. Select this CSV in **Gait analysis lab > Import CSV**. Wiring and commands are in `hardware/ESP32_WIRING_AND_CAPTURE.md`. The UPDATED package includes `live_server.py` and `START_LIVE_MAC.command` for serial-to-browser streaming. The bridge has been tested with a controlled virtual serial feed, but physical end-to-end verification with the actual ESP32 is still necessary on the user laptop.

## If you eventually want a model validated on real walking

Collect recorded sessions from volunteers with timestamps and suitable consent. Independently label the gait states using a reliable reference method. Split train/test by person, not by near-duplicate windows from the same person, and evaluate on an external real-device test set. Update the model with these real examples and report classification metrics with limitations. Synthetic-generated labels are not a substitute for this.
