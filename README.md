# ONTHE.HAUS

<div align="center">

![ONTHE.HAUS Logo](https://github.com/cazh0/ONTHE.HAUS/blob/main/images/logo.png)

**LALAL.AI Downloader**

[![License: Non-Commercial](https://img.shields.io/badge/License-Non--Commercial-blue.svg)](https://github.com/cazh0/ONTHE.HAUS/blob/main/LICENSE.md)
[![Version](https://img.shields.io/badge/Version-1.0-orange)](https://github.com/cazh0/ONTHE.HAUS)

</div>

## Overview

ONTHE.HAUS is a Chrome extension that downloads full audio tracks from lalal.ai by capturing and stitching preview segments.

## Features

- **Automatic Capture:** Grabs MP3 segments as you play previews
- **Audio Stitching:** Combines segments into complete WAV files
- **Download Options:** Save individual segments or full tracks
- **Playback:** Preview segments before downloading
- **Organization:** Groups segments by track name

## Installation

1. Download this repository as a ZIP file and extract it
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the extracted folder

## Usage

1. Go to lalal.ai
2. Play any track preview
3. Click the ONTHE.HAUS extension icon
4. Download segments individually or click "Download Full Track"

Note: Segment 000 must be captured before you can download the full stitched track.

## Technical Details

- Built with vanilla JavaScript
- Uses Chrome Extension Manifest V3
- Intercepts network requests via content script injection
- Uses Web Audio API for segment stitching
- Outputs 16-bit WAV files

## Privacy

All audio processing happens locally in your browser. No data is sent to any external servers.

## License

This project is licensed under a custom Non-Commercial License. Free for personal use, commercial use requires a license. See the [LICENSE](https://github.com/cazh0/ONTHE.HAUS/blob/main/LICENSE.md) file for full details.

**For commercial licensing:**
- GitHub: [@cazh0](https://github.com/cazh0)

---

<div align="center">
  <p>© 2025 cazh0</p>
</div>
