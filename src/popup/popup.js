'use strict';

const playlistsContainer = document.getElementById('playlists');
const emptyState = document.getElementById('emptyState');
const clearBtn = document.getElementById('clearBtn');
const refreshBtn = document.getElementById('refreshBtn');
const audioPlayer = document.getElementById('audioPlayer');

let currentlyPlaying = null;

// --- Segment template (parsed once, cloned per instance) ---

const segmentTemplate = document.createElement('template');
segmentTemplate.innerHTML =
  '<div class="segment">' +
    '<span class="segment-name"></span>' +
    '<div class="segment-controls">' +
      '<button class="play-btn"><img src="../../images/play.svg" alt="Play" class="btn-icon"></button>' +
      '<button class="download-btn"><img src="../../images/download.svg" alt="Download" class="btn-icon"></button>' +
    '</div>' +
  '</div>';

// --- WAV Encoding (zero-copy, single-allocation) ---

function writeString(view, offset, string) {
  for (let i = 0, len = string.length; i < len; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Converts an AudioBuffer to a WAV Blob using a single ArrayBuffer allocation.
 *
 * Optimizations vs. naive approach:
 *   1. Channel data references extracted once (avoids per-sample getChannelData overhead)
 *   2. PCM samples written directly into the WAV ArrayBuffer via Int16Array view
 *      — eliminates intermediate buffer allocation and the copy loop
 *   3. Proper clamping with bounds check (handles NaN → 0 via bitwise OR)
 *
 * Endianness: Int16Array uses native byte order. All Chrome platforms (x86, x64, ARM,
 * RISC-V) are little-endian, matching WAV's required byte order.
 */
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const blockAlign = numChannels * 2;
  const bufferLen = buffer.length;
  const dataLength = bufferLen * numChannels * 2;

  // Single allocation for the entire WAV file (header + PCM data)
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);

  // RIFF/WAV header (44 bytes)
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Cache channel Float32Array references (critical: avoids per-sample getChannelData call)
  const channels = new Array(numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    channels[ch] = buffer.getChannelData(ch);
  }

  // Write PCM samples directly into the ArrayBuffer via Int16Array view
  // Byte offset 44 is divisible by 2 (Int16Array element size), so this is valid
  const samples = new Int16Array(arrayBuffer, 44);
  let idx = 0;

  for (let i = 0; i < bufferLen; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = channels[ch][i];
      // Clamp to [-1, 1] and convert to 16-bit PCM
      // Bitwise OR truncates to integer; NaN | 0 === 0 (produces silence for corrupt data)
      samples[idx++] = s < 0
        ? (s <= -1 ? -0x8000 : (s * 0x8000) | 0)
        : (s >= 1 ? 0x7FFF : (s * 0x7FFF) | 0);
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// --- Audio Stitching ---

async function stitchAndDownload(segments, playlistName, button) {
  if (!segments['000']) {
    alert('Segment 000 is required to stitch the track.');
    return;
  }

  const originalText = button.textContent;
  button.textContent = 'Stitching...';
  button.disabled = true;

  let audioContext = null;
  let objectURL = null;

  try {
    const segmentNumbers = Object.keys(segments).sort((a, b) => a - b);
    audioContext = new AudioContext();

    // Fetch all segments in parallel
    const responses = await Promise.all(
      segmentNumbers.map(num => fetch(segments[num]))
    );

    // Validate all HTTP responses before proceeding to decode
    for (const response of responses) {
      if (!response.ok) {
        throw new Error(`Fetch failed: HTTP ${response.status}`);
      }
    }

    const arrayBuffers = await Promise.all(
      responses.map(r => r.arrayBuffer())
    );

    const audioBuffers = await Promise.all(
      arrayBuffers.map(buf => audioContext.decodeAudioData(buf))
    );

    const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const numChannels = audioBuffers[0].numberOfChannels;
    const sampleRate = audioBuffers[0].sampleRate;

    const outputBuffer = audioContext.createBuffer(numChannels, totalLength, sampleRate);

    let offset = 0;
    for (const buf of audioBuffers) {
      for (let ch = 0; ch < numChannels; ch++) {
        outputBuffer.getChannelData(ch).set(buf.getChannelData(ch), offset);
      }
      offset += buf.length;
    }

    const wavBlob = audioBufferToWav(outputBuffer);
    objectURL = URL.createObjectURL(wavBlob);

    chrome.downloads.download({
      url: objectURL,
      filename: `${playlistName}_full.wav`,
      saveAs: true
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Download failed:', chrome.runtime.lastError.message);
      }
      if (objectURL) {
        URL.revokeObjectURL(objectURL);
        objectURL = null;
      }
      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }
    });
  } catch (error) {
    console.error('Stitch failed:', error);
    alert(`Failed to stitch segments: ${error.message}`);

    if (objectURL) URL.revokeObjectURL(objectURL);
    if (audioContext) audioContext.close();
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
}

// --- Downloads ---

function downloadAllSegments(segments, playlistName) {
  const segmentNumbers = Object.keys(segments).sort((a, b) => a - b);

  for (const num of segmentNumbers) {
    chrome.downloads.download({
      url: segments[num],
      filename: `${playlistName}_segment-${num}.mp3`,
      saveAs: false
    });
  }
}

function downloadSegment(url, playlistName, segmentNum) {
  chrome.downloads.download({
    url: url,
    filename: `${playlistName}_segment-${segmentNum}.mp3`,
    saveAs: true
  });
}

// --- Playback ---

function resetPlayIcon(button) {
  const icon = button.querySelector('.btn-icon');
  icon.src = '../../images/play.svg';
  icon.alt = 'Play';
}

function playSegment(url, button) {
  const icon = button.querySelector('.btn-icon');

  if (currentlyPlaying === button && !audioPlayer.paused) {
    audioPlayer.pause();
    icon.src = '../../images/play.svg';
    icon.alt = 'Play';
    currentlyPlaying = null;
  } else {
    if (currentlyPlaying) {
      resetPlayIcon(currentlyPlaying);
    }
    audioPlayer.src = url;
    audioPlayer.play().catch(() => {
      // Playback rejected (e.g. network error, codec issue)
      icon.src = '../../images/play.svg';
      icon.alt = 'Play';
      currentlyPlaying = null;
    });
    icon.src = '../../images/pause.svg';
    icon.alt = 'Pause';
    currentlyPlaying = button;
  }
}

// --- DOM Construction ---

function createSegmentElement(segmentNum, url, playlistName) {
  const el = segmentTemplate.content.cloneNode(true).firstElementChild;

  el.querySelector('.segment-name').textContent = `Segment ${segmentNum}`;

  const playBtn = el.querySelector('.play-btn');
  playBtn.onclick = () => playSegment(url, playBtn);

  el.querySelector('.download-btn').onclick = () => downloadSegment(url, playlistName, segmentNum);

  return el;
}

function createPlaylistElement(playlistName, segments, isCollapsed) {
  const playlistDiv = document.createElement('div');
  playlistDiv.className = isCollapsed ? 'playlist collapsed' : 'playlist';

  const header = document.createElement('div');
  header.className = 'playlist-header';

  const titleContainer = document.createElement('div');
  titleContainer.className = 'playlist-title-container';

  const arrow = document.createElement('span');
  arrow.className = 'playlist-arrow';
  arrow.textContent = isCollapsed ? '▶' : '▼';

  const title = document.createElement('h2');
  title.textContent = playlistName.replace(/_/g, ' ');

  titleContainer.appendChild(arrow);
  titleContainer.appendChild(title);

  const stitchBtn = document.createElement('button');
  stitchBtn.className = 'stitch-btn';
  stitchBtn.textContent = 'Download Full Track';

  if (!segments['000']) {
    stitchBtn.disabled = true;
    stitchBtn.title = 'Segment 000 required';
  }

  stitchBtn.onclick = (e) => {
    e.stopPropagation();
    stitchAndDownload(segments, playlistName, stitchBtn);
  };

  const downloadAllBtn = document.createElement('button');
  downloadAllBtn.className = 'download-all-btn';
  downloadAllBtn.textContent = 'Download All';
  downloadAllBtn.onclick = (e) => {
    e.stopPropagation();
    downloadAllSegments(segments, playlistName);
  };

  header.appendChild(titleContainer);
  header.appendChild(stitchBtn);
  header.appendChild(downloadAllBtn);

  const segmentsDiv = document.createElement('div');
  segmentsDiv.className = 'segments';

  header.onclick = () => {
    playlistDiv.classList.toggle('collapsed');
    arrow.textContent = playlistDiv.classList.contains('collapsed') ? '▶' : '▼';
  };

  const segmentNumbers = Object.keys(segments).sort((a, b) => a - b);

  const fragment = document.createDocumentFragment();
  for (const num of segmentNumbers) {
    fragment.appendChild(createSegmentElement(num, segments[num], playlistName));
  }
  segmentsDiv.appendChild(fragment);

  playlistDiv.appendChild(header);
  playlistDiv.appendChild(segmentsDiv);

  return playlistDiv;
}

// --- Display ---

function displayPlaylists(playlists) {
  // Preserve collapsed state across re-renders
  const collapsedStates = new Set();
  const existing = playlistsContainer.querySelectorAll('.playlist.collapsed h2');

  for (const el of existing) {
    collapsedStates.add(el.textContent.replace(/ /g, '_'));
  }

  const playlistNames = Object.keys(playlists);

  if (playlistNames.length === 0) {
    playlistsContainer.textContent = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  playlistNames.sort();

  const fragment = document.createDocumentFragment();
  for (const name of playlistNames) {
    fragment.appendChild(
      createPlaylistElement(name, playlists[name], collapsedStates.has(name))
    );
  }

  // Stop playback before tearing down DOM (prevents orphaned audio state)
  if (currentlyPlaying) {
    audioPlayer.pause();
    currentlyPlaying = null;
  }

  playlistsContainer.textContent = '';
  playlistsContainer.appendChild(fragment);
}

function loadPlaylists() {
  chrome.storage.local.get(['playlists'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load playlists:', chrome.runtime.lastError.message);
      return;
    }
    displayPlaylists(result.playlists || {});
  });
}

// --- Event Listeners ---

audioPlayer.addEventListener('ended', () => {
  if (currentlyPlaying) {
    resetPlayIcon(currentlyPlaying);
    currentlyPlaying = null;
  }
}, false);

audioPlayer.addEventListener('error', () => {
  if (currentlyPlaying) {
    resetPlayIcon(currentlyPlaying);
    currentlyPlaying = null;
  }
}, false);

clearBtn.addEventListener('click', () => {
  if (confirm('Clear all captured segments?')) {
    audioPlayer.pause();
    currentlyPlaying = null;
    chrome.storage.local.remove('playlists', () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to clear playlists:', chrome.runtime.lastError.message);
        return;
      }
      loadPlaylists();
      chrome.action.setBadgeText({ text: '' });
    });
  }
}, false);

refreshBtn.addEventListener('click', loadPlaylists, false);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.playlists) {
    // Use newValue directly — eliminates a redundant chrome.storage.local.get round-trip
    displayPlaylists(changes.playlists.newValue || {});
  }
});

// Clear badge when popup opens (replaces the dead onClicked listener from background.js)
chrome.action.setBadgeText({ text: '' });

loadPlaylists();
