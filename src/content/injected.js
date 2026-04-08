(function () {
  // Guard against duplicate injection (e.g. multiple content script runs)
  if (window.__onthehaus__) return;
  window.__onthehaus__ = true;

  const originalFetch = window.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;

  /**
   * Extracts a URL string from the various types accepted by fetch() and XHR.open():
   *   - string: returned as-is
   *   - Request: returns .url
   *   - URL: returns .href
   */
  function extractUrl(input) {
    if (typeof input === 'string') return input;
    if (input != null && typeof input === 'object') {
      return input.url || input.href || null;
    }
    return null;
  }

  function dispatchIfSegment(url) {
    if (typeof url === 'string' && url.includes('.mp3') && url.includes('segment-')) {
      window.dispatchEvent(new CustomEvent('mp3Detected', { detail: { url } }));
    }
  }

  window.fetch = function (input) {
    try {
      const url = extractUrl(input);
      if (url) dispatchIfSegment(url);
    } catch (_) { /* Never interfere with page behavior */ }
    return originalFetch.apply(this, arguments);
  };

  XMLHttpRequest.prototype.open = function (_method, url) {
    try {
      const resolved = extractUrl(url);
      if (resolved) dispatchIfSegment(resolved);
    } catch (_) { /* Never interfere with page behavior */ }
    return originalXHROpen.apply(this, arguments);
  };
})();
