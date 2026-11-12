/* SmartInsole prototype data acquisition - CSV over USB Serial.
   Example ESP32 DevKit wiring:
    Heel FSR voltage divider output -> GPIO34
    Midfoot FSR voltage divider output -> GPIO35
    Toe FSR voltage divider output -> GPIO32
    MPU6050 VCC -> 3V3, GND -> GND, SDA -> GPIO21, SCL -> GPIO22
   Each FSR voltage divider: 3V3 -- FSR -- analog pin -- 10k resistor -- GND.
   IMPORTANT: ESP32 GPIO is 3.3V ONLY. Verify your board and sensor wiring.
   This sketch is not a medical device or a validated gait classifier.
*/
#include <Arduino.h>
#include <Wire.h>
const uint8_t HEEL_PIN=34, MID_PIN=35, TOE_PIN=32;
const uint8_t MPU_ADDR=0x68;
const int SAMPLE_PERIOD_MS=25;  // nominal 40 Hz
bool mpuOK=false;
uint32_t lastSample=0;

bool readMPU(int16_t &ax,int16_t &ay,int16_t &az,int16_t &gx,int16_t &gy,int16_t &gz){
  if(!mpuOK) return false;
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if(Wire.endTransmission(false)!=0) return false;
  int count=Wire.requestFrom((int)MPU_ADDR,14,true);
  if(count!=14) return false;
  ax=(int16_t)((Wire.read()<<8)|Wire.read());
  ay=(int16_t)((Wire.read()<<8)|Wire.read());
  az=(int16_t)((Wire.read()<<8)|Wire.read());
  (void)Wire.read(); (void)Wire.read(); // temperature bytes
  gx=(int16_t)((Wire.read()<<8)|Wire.read());
  gy=(int16_t)((Wire.read()<<8)|Wire.read());
  gz=(int16_t)((Wire.read()<<8)|Wire.read());
  return true;
}
void setup(){
  Serial.begin(115200);
  Wire.begin(21,22);
  analogReadResolution(12);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // Power management 1
  Wire.write(0x00); // Wake MPU6050
  mpuOK=(Wire.endTransmission()==0);
  delay(300);
  Serial.println("time_s,heel,midfoot,toe,ax,ay,az,gx,gy,gz");
}
void loop(){
  if(millis()-lastSample < SAMPLE_PERIOD_MS) return;
  lastSample=millis();
  int heel=analogRead(HEEL_PIN), mid=analogRead(MID_PIN), toe=analogRead(TOE_PIN);
  int16_t ax=0,ay=0,az=0,gx=0,gy=0,gz=0;
  if(!readMPU(ax,ay,az,gx,gy,gz)){
    // Hardware must be checked if IMU values remain zero.
    // The sensor-data dashboard can still import FSR data.
  }
  Serial.print(lastSample/1000.0f,3); Serial.print(',');
  Serial.print(heel); Serial.print(','); Serial.print(mid); Serial.print(','); Serial.print(toe);
  Serial.print(','); Serial.print(ax); Serial.print(','); Serial.print(ay); Serial.print(','); Serial.print(az);
  Serial.print(','); Serial.print(gx); Serial.print(','); Serial.print(gy); Serial.print(','); Serial.println(gz);
}
