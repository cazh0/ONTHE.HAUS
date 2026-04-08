'use strict';

const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/content/injected.js');
(document.head || document.documentElement).appendChild(script);
script.remove();

window.addEventListener('mp3Detected', (event) => {
  try {
    // chrome.runtime.id is undefined when the extension context is invalidated
    // (e.g. extension updated/reloaded while the page is still open)
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({
        type: 'mp3Captured',
        url: event.detail.url
      });
    }
  } catch (_) {
    // Extension context invalidated — silently ignore
  }
}, false);
