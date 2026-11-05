# 🎬 Digen AI Video Generator Extension

## What This Does
This browser extension automates video generation on Digen.ai using your **already logged-in browser**. No need for session IDs, remote debugging, or closing Edge!

## Features
✅ Works with your existing logged-in Digen AI account  
✅ Preset prompts for quick generation  
✅ Custom prompt support  
✅ Auto-click generate button  
✅ Saves your last prompt  
✅ Works on Edge and Chrome  

## Installation Instructions

### Step 1: Create Icon Files (Required)
The extension needs icon files. Use one of these methods:

**Option A - Online Converter (Easiest):**
1. Open the file `icon128.svg` in this folder
2. Go to https://convertio.co/svg-png/
3. Upload `icon128.svg` and convert to PNG
4. Download and rename it to `icon128.png`
5. Go to https://www.iloveimg.com/resize-image
6. Upload `icon128.png` and resize to:
   - 16x16 pixels → save as `icon16.png`
   - 48x48 pixels → save as `icon48.png`
7. Put all three PNG files in the `digen-extension` folder

**Option B - Use Any Image:**
If you don't want to convert SVG, just use any image (PNG/JPG):
1. Rename your image to `icon128.png`
2. Copy it twice as `icon16.png` and `icon48.png`
3. The extension will work fine with any icon

### Step 2: Install the Extension in Edge

1. **Open Edge** and go to: `edge://extensions/`

2. **Enable Developer Mode**  
   Toggle the "Developer mode" switch in the bottom-left corner

3. **Load the Extension**  
   Click "Load unpacked" button

4. **Select the Folder**  
   Navigate to and select this folder:  
   `C:\Users\tusha\OneDrive\Desktop\video gen\digen-extension`

5. **Done!**  
   You should see "Digen AI Video Generator" in your extensions list

### Step 3: Pin the Extension (Optional but Recommended)

1. Click the puzzle piece icon (🧩) in Edge toolbar
2. Find "Digen AI Video Generator"
3. Click the pin icon to keep it visible

## How to Use

### Quick Start:
1. **Go to Digen AI**: Navigate to https://digen.ai/en/explore (make sure you're logged in)
2. **Click Extension Icon**: Click the extension icon in your toolbar
3. **Choose or Edit Prompt**: 
   - Click a preset button (🚗 Toy Car Racing, 🚂 Toy Train, 🤖 Dancing Robot)
   - Or edit the text in the box
4. **Click Generate**: Hit the "🚀 Generate Video" button
5. **Watch It Work**: The extension will fill in your prompt and click generate automatically!

### Settings:
- **Auto-click Generate**: Automatically clicks the generate button (enabled by default)
- **Save Prompts**: Remembers your last prompt for next time (enabled by default)

## Files Included

```
digen-extension/
├── manifest.json       # Extension configuration
├── popup.html         # Extension popup interface
├── popup.js           # Popup logic
├── content.js         # Script that runs on Digen AI pages
├── icon128.svg        # Icon source file (needs conversion)
└── README.md          # This file
```

## Troubleshooting

**Extension doesn't appear?**
- Make sure you created the icon PNG files (icon16.png, icon48.png, icon128.png)
- Try refreshing the extensions page

**"Could not find input field"?**
- The page structure might have changed
- Try refreshing the Digen AI page
- Make sure you're on https://digen.ai/en/explore

**Generate button not clicking automatically?**
- Toggle off "Auto-click Generate" in settings
- Click the generate button manually after the prompt is filled

**Need to update the extension?**
- Make any changes to the files
- Go to `edge://extensions/`
- Click the refresh icon on the extension card

## For Chrome Users

The same extension works in Chrome:
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `digen-extension` folder

## Support

If you need help or want to customize the extension, you can:
- Edit the prompt presets in `popup.html`
- Modify the automation logic in `content.js`
- Adjust the UI styling in `popup.html`

---

**Created with Claude Code** 🤖
