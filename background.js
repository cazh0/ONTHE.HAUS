const pendingSegments = new Map();
const DEBOUNCE_MS = 100;
const REGEX_PATTERN = /\/([^/]+)\/segment-(\d+)\.mp3/;
let processingTimer = null;

function scheduleProcessing() {
  if (processingTimer !== null) {
    clearTimeout(processingTimer);
  }
  processingTimer = setTimeout(processPendingSegments, DEBOUNCE_MS);
}

function processPendingSegments() {
  processingTimer = null;
  
  if (pendingSegments.size === 0) return;
  
  const batch = new Map(pendingSegments);
  pendingSegments.clear();
  
  chrome.storage.local.get(['playlists'], (result) => {
    const playlists = result.playlists || {};
    let modified = false;
    
    for (const [, segment] of batch) {
      const {playlistName, segmentNumber, url} = segment;
      
      if (!playlists[playlistName]) {
        playlists[playlistName] = {};
      }
      
      if (!playlists[playlistName][segmentNumber]) {
        playlists[playlistName][segmentNumber] = url;
        modified = true;
      }
    }
    
    if (modified) {
      chrome.storage.local.set({playlists}, () => {
        chrome.action.setBadgeText({text: '!'});
        chrome.action.setBadgeBackgroundColor({color: '#4CAF50'});
      });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'mp3Captured') return;
  
  const match = REGEX_PATTERN.exec(message.url);
  if (!match) return;
  
  const key = `${match[1]}:${match[2]}`;
  
  if (!pendingSegments.has(key)) {
    pendingSegments.set(key, {
      playlistName: match[1],
      segmentNumber: match[2],
      url: message.url
    });
  }
  
  scheduleProcessing();
});

chrome.action.onClicked.addListener(() => {
  chrome.action.setBadgeText({text: ''});
});
