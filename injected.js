(function() {
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  
  function checkAndDispatch(url) {
    if (typeof url === 'string' && url.includes('segment-') && url.includes('.mp3')) {
      window.dispatchEvent(new CustomEvent('mp3Detected', {detail: {url}}));
    }
  }
  
  window.fetch = function(...args) {
    checkAndDispatch(args[0]);
    return originalFetch.apply(this, args);
  };
  
  XMLHttpRequest.prototype.open = function(method, url) {
    checkAndDispatch(url);
    return originalOpen.apply(this, arguments);
  };
})();
