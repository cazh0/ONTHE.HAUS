const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
(document.head || document.documentElement).appendChild(script);
script.remove();

window.addEventListener('mp3Detected', (event) => {
  chrome.runtime.sendMessage({
    type: 'mp3Captured',
    url: event.detail.url
  });
}, false);
