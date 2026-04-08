'use strict';

const SEGMENT_REGEX = /\/([^/]+)\/segment-(\d+)\.mp3/;
const pendingSegments = new Map();
let processing = false;

/**
 * Drains the pending segment map into storage with serialized access.
 * Only one storage read-modify-write cycle runs at a time, eliminating
 * the TOCTOU race that existed with the previous debounce approach.
 * Any segments arriving during processing accumulate in the Map and
 * are picked up by the recursive tail call.
 */
function processQueue() {
  if (processing || pendingSegments.size === 0) return;
  processing = true;

  const batch = new Map(pendingSegments);
  pendingSegments.clear();

  chrome.storage.local.get(['playlists'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Storage read error:', chrome.runtime.lastError.message);
      // Restore segments so they aren't lost — will retry on next incoming message
      for (const [key, seg] of batch) {
        if (!pendingSegments.has(key)) pendingSegments.set(key, seg);
      }
      processing = false;
      return;
    }

    const playlists = result.playlists || {};
    let modified = false;

    for (const [, segment] of batch) {
      const { playlistName, segmentNumber, url } = segment;

      if (!playlists[playlistName]) {
        playlists[playlistName] = {};
      }

      if (!playlists[playlistName][segmentNumber]) {
        playlists[playlistName][segmentNumber] = url;
        modified = true;
      }
    }

    if (!modified) {
      processing = false;
      processQueue();
      return;
    }

    chrome.storage.local.set({ playlists }, () => {
      if (chrome.runtime.lastError) {
        console.error('Storage write error:', chrome.runtime.lastError.message);
      } else {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      }
      processing = false;
      processQueue();
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'mp3Captured' || typeof message.url !== 'string') return;

  const match = SEGMENT_REGEX.exec(message.url);
  if (!match) return;

  const key = `${match[1]}:${match[2]}`;

  if (!pendingSegments.has(key)) {
    pendingSegments.set(key, {
      playlistName: match[1],
      segmentNumber: match[2],
      url: message.url
    });
  }

  processQueue();
});
