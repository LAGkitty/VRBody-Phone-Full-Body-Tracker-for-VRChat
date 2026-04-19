[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/lagkitty)

# 🕹️ VRBody — Phone Full Body Tracker for VRChat

Use your **phone's camera + AI pose detection** to drive full body tracking in VRChat — no hardware trackers needed.

```
[Phone Camera] → MediaPipe AI → WebSocket → PC Server → OSC → VRChat
```

---

## 📋 Requirements

- A PC running Windows / Mac / Linux
- [Node.js](https://nodejs.org) v16 or newer
- Your phone and PC on the **same Wi-Fi network**
- VRChat with an **Avatar 3.0** that supports full body tracking

---

## 🚀 Setup (3 steps)

### 1 — Install & run the server

```bash
#Download the folder
cd VRBody
npm install
npm start
```

A QR code will appear in the terminal.

### 2 — Enable OSC in VRChat

**Settings → OSC → Enable**

### 3 — Open the phone app

Scan the QR code from the terminal with your phone.

- **Android (Chrome):** works over local HTTP — scan the QR code
- **iPhone (Safari):** requires HTTPS — see [iPhone setup](#-iphone-setup) below

Tap **▶ TRACK**, allow camera access, and you're live.

---

## 📱 iPhone Setup

iOS Safari requires HTTPS to access the camera. The server supports automatic HTTPS tunneling via [ngrok](https://ngrok.com) (free).

1. Sign up for free at [ngrok.com](https://ngrok.com) and copy your **Authtoken**. *(Note: the `ngrok config add-authtoken` command will NOT work for this app)*
2. In the main `VRBody` folder, manually **create a new text file** and name it EXACTLY `.env` (don't forget the dot at the beginning, and make sure it doesn't end in `.txt`).
3. Open the new `.env` file in Notepad (or any text editor) and paste your token inside like this:
   ```text
   NGROK_AUTHTOKEN=your_token_here
   ```
4. Save the file and run `npm start` (or restart the server if it's already running).
5. A second QR code with an `https://` URL will appear. **Scan this HTTPS QR code** on your iPhone.

---

## ⚙️ Configuration

You can set these in `.env` or as environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8765` | WebSocket / HTTP server port |
| `OSC_PORT` | `9000` | VRChat OSC UDP port |
| `NGROK_AUTHTOKEN` | *(none)* | Ngrok token for iPhone HTTPS |

---

## 📱 App Features

| Feature | Description |
|---|---|
| **AI Model** | Lite / Full / Max accuracy modes |
| **Smoothing** | Adjustable jitter reduction |
| **Active Trackers** | Toggle Hip, Feet, Knees, Chest, Elbows |
| **Calibration** | T-pose calibration for better accuracy |
| **Rotation Mode** | Euler or Quaternion output |
| **Scale / Offset** | Body scale and height adjustment |

---

## 🔧 Troubleshooting

**Phone won't load the page**
- Confirm both devices are on the same Wi-Fi
- Check Windows Firewall — allow Node.js or open port 8765 (TCP inbound)

**"Camera API missing" on iPhone**
- You must use the HTTPS ngrok URL, not the local `http://192.168...` one
- See [iPhone setup](#-iphone-setup) above

**Pose not detected**
- Good lighting, avoid strong backlight
- Stand 2–3 m from phone, full body in frame
- Try **0.5× zoom** and **back camera**

**VRChat not responding**
- Confirm OSC is enabled in VRChat
- Avatar must be Avatar 3.0 with FBT support
- Check terminal shows `pkt/s` updating

---

## 🏗️ How It Works

```
┌─────────────────────────────────┐
│  Phone (index.html)             │
│  MediaPipe Pose AI runs here    │
│  Sends JSON pose data over WS   │
└──────────────┬──────────────────┘
               │ WebSocket (ws:// or wss://)
               ▼
┌─────────────────────────────────┐
│  PC (server.js)                 │
│  Receives pose data             │
│  Converts to OSC packets        │
└──────────────┬──────────────────┘
               │ UDP OSC → 127.0.0.1:9000
               ▼
┌─────────────────────────────────┐
│  VRChat                         │
│  /tracking/trackers/{id}/...    │
│  Your avatar moves! 🕺          │
└─────────────────────────────────┘
```

---

## 💡 Tips

- Mount phone on a tripod at chest–head height pointing at your play area
- Use **back camera** for better quality than selfie cam
- Calibrate in **T-pose** at the start of every session
- **LITE model** on older phones, **FULL** on modern ones
- Lower **Send Rate** to 30 if you notice lag
