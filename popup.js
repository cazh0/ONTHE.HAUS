const playlistsContainer = document.getElementById('playlists');
const emptyState = document.getElementById('emptyState');
const clearBtn = document.getElementById('clearBtn');
const refreshBtn = document.getElementById('refreshBtn');
const audioPlayer = document.getElementById('audioPlayer');

let currentlyPlaying = null;

function writeString(view, offset, string) {
  const len = string.length;
  for (let i = 0; i < len; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const bufferLen = buffer.length;
  
  const data = new Int16Array(bufferLen * numChannels);
  let dataIdx = 0;
  
  for (let i = 0; i < bufferLen; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      data[dataIdx++] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
  }
  
  const dataLength = data.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
  
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
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    view.setInt16(offset, data[i], true);
    offset += 2;
  }
  
  return new Blob([arrayBuffer], {type: 'audio/wav'});
}

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
    const segmentNumbers = Object.keys(segments).sort((a, b) => parseInt(a) - parseInt(b));
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    const responses = await Promise.all(
      segmentNumbers.map(num => fetch(segments[num]))
    );
    
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
      if (objectURL) URL.revokeObjectURL(objectURL);
      if (audioContext) audioContext.close();
    });
    
    button.textContent = originalText;
    button.disabled = false;
  } catch (error) {
    console.error('Stitch failed:', error);
    alert('Failed to stitch segments. Please try again.');
    button.textContent = originalText;
    button.disabled = false;
    
    if (objectURL) URL.revokeObjectURL(objectURL);
    if (audioContext) audioContext.close();
  }
}

function downloadAllSegments(segments, playlistName) {
  const segmentNumbers = Object.keys(segments).sort((a, b) => parseInt(a) - parseInt(b));
  
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

function playSegment(url, button) {
  const icon = button.querySelector('.btn-icon');
  
  if (currentlyPlaying === button && !audioPlayer.paused) {
    audioPlayer.pause();
    icon.src = 'images/play.svg';
    icon.alt = 'Play';
    currentlyPlaying = null;
  } else {
    if (currentlyPlaying) {
      const prevIcon = currentlyPlaying.querySelector('.btn-icon');
      prevIcon.src = 'images/play.svg';
      prevIcon.alt = 'Play';
    }
    audioPlayer.src = url;
    audioPlayer.play();
    icon.src = 'images/pause.svg';
    icon.alt = 'Pause';
    currentlyPlaying = button;
  }
}

function createSegmentElement(segmentNum, url, playlistName) {
  const segmentDiv = document.createElement('div');
  segmentDiv.className = 'segment';
  
  const segmentName = document.createElement('span');
  segmentName.className = 'segment-name';
  segmentName.textContent = `Segment ${segmentNum}`;
  
  const controls = document.createElement('div');
  controls.className = 'segment-controls';
  
  const playBtn = document.createElement('button');
  playBtn.className = 'play-btn';
  const playIcon = document.createElement('img');
  playIcon.src = 'images/play.svg';
  playIcon.alt = 'Play';
  playIcon.className = 'btn-icon';
  playBtn.appendChild(playIcon);
  playBtn.onclick = () => playSegment(url, playBtn);
  
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'download-btn';
  const downloadIcon = document.createElement('img');
  downloadIcon.src = 'images/download.svg';
  downloadIcon.alt = 'Download';
  downloadIcon.className = 'btn-icon';
  downloadBtn.appendChild(downloadIcon);
  downloadBtn.onclick = () => downloadSegment(url, playlistName, segmentNum);
  
  controls.appendChild(playBtn);
  controls.appendChild(downloadBtn);
  segmentDiv.appendChild(segmentName);
  segmentDiv.appendChild(controls);
  
  return segmentDiv;
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
  
  const segmentNumbers = Object.keys(segments).sort((a, b) => parseInt(a) - parseInt(b));
  
  const fragment = document.createDocumentFragment();
  for (const num of segmentNumbers) {
    fragment.appendChild(createSegmentElement(num, segments[num], playlistName));
  }
  segmentsDiv.appendChild(fragment);
  
  playlistDiv.appendChild(header);
  playlistDiv.appendChild(segmentsDiv);
  
  return playlistDiv;
}

function displayPlaylists(playlists) {
  const collapsedStates = new Set();
  const existing = playlistsContainer.querySelectorAll('.playlist.collapsed h2');
  
  for (const el of existing) {
    collapsedStates.add(el.textContent.replace(/ /g, '_'));
  }
  
  const playlistNames = Object.keys(playlists);
  
  if (playlistNames.length === 0) {
    playlistsContainer.innerHTML = '';
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
  
  playlistsContainer.innerHTML = '';
  playlistsContainer.appendChild(fragment);
}

function loadPlaylists() {
  chrome.storage.local.get(['playlists'], (result) => {
    displayPlaylists(result.playlists || {});
  });
}

audioPlayer.addEventListener('ended', () => {
  if (currentlyPlaying) {
    const icon = currentlyPlaying.querySelector('.btn-icon');
    icon.src = 'images/play.svg';
    icon.alt = 'Play';
    currentlyPlaying = null;
  }
}, false);

clearBtn.addEventListener('click', () => {
  if (confirm('Clear all captured segments?')) {
    chrome.storage.local.remove('playlists', () => {
      loadPlaylists();
      chrome.action.setBadgeText({text: ''});
    });
  }
}, false);

refreshBtn.addEventListener('click', loadPlaylists, false);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.playlists) {
    loadPlaylists();
  }
});

loadPlaylists();
