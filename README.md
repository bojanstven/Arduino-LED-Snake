# 🎮 Nintendo Switch Pro Controller + Arduino Uno R4 WiFi via Web Serial

## 🕹️ Project Overview

This project turns your **Nintendo Switch Pro Controller** (or any other supported gamepad) into a **real-time USB controller** for an [Arduino Uno R4 WiFi](https://store.arduino.cc/products/uno-r4-wifi), using the browser-based **Web Serial API**.

No Wi-Fi. No Bluetooth bridges. No latency-prone HTTP hacks.  
Just plug in your Arduino, open the web interface, and **play using a real game controller** — with movement displayed live on the board’s built-in **12x8 LED matrix**.

> ✅ Also supports keyboard input (WASD / Arrow Keys) for testing or fallback.

---

## 🧩 Components

- **Arduino Uno R4 WiFi**  
  With integrated **12x8 LED matrix**, used as the game screen.

- **Nintendo Switch Pro Controller** (or any standard HID-compliant gamepad)  
  Connected to your computer via Bluetooth or USB.

- **Computer with Chrome/Edge**  
  Browser handles Serial connection and Gamepad API input.

- **Web Interface**  
  A lightweight HTML+JS page that bridges gamepad input to the Arduino over Web Serial.

---

## ✅ Features

- 🎮 Gamepad support via modern [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)
- 🔌 Web Serial communication — no intermediate servers or drivers
- ⌨️ WASD and arrow key fallback for quick testing/debugging
- 🧠 Dot movement rendered in real time on the Arduino’s LED matrix
- 🧹 Simple architecture: browser ↔ Arduino (USB)

---

## 🚧 Current Implementation

- Connect your **Arduino Uno R4 WiFi** via USB.
- Open the `ArduinoGamepad.html` page in Chrome or Edge.
- Press **"Connect"** to open a Web Serial connection.
- Pair your **Nintendo Switch Pro Controller** via Bluetooth.
- Move the stick or press the D-pad — the dot moves accordingly on the Arduino.
- Use keyboard (WASD/arrow keys) for quick checks if the controller is unavailable.

---