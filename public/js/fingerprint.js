/**
 * Client-side browser fingerprint generation
 * Generates a unique ID for each browser and stores it in localStorage
 */

(function() {
  // Get or create fingerprint
  function getFingerprint() {
    // Check if fingerprint already exists in localStorage
    let fingerprint = localStorage.getItem('clientFingerprint');

    if (!fingerprint) {
      // Generate new fingerprint using UUID v4
      fingerprint = generateUUID();
      localStorage.setItem('clientFingerprint', fingerprint);
      console.log('[Fingerprint] Generated new fingerprint:', fingerprint);
    } else {
      console.log('[Fingerprint] Using existing fingerprint:', fingerprint);
    }

    return fingerprint;
  }

  // Generate UUID v4
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Intercept fetch requests to add fingerprint header
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const fingerprint = getFingerprint();

    // Add fingerprint header to request
    if (args[1]) {
      args[1].headers = args[1].headers || {};
      if (args[1].headers instanceof Headers) {
        args[1].headers.append('X-Client-Fingerprint', fingerprint);
      } else {
        args[1].headers['X-Client-Fingerprint'] = fingerprint;
      }
    } else {
      args[1] = {
        headers: {
          'X-Client-Fingerprint': fingerprint
        }
      };
    }

    return originalFetch.apply(this, args);
  };

  // Intercept XMLHttpRequest to add fingerprint header
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function() {
    this._url = arguments[1];
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    const fingerprint = getFingerprint();
    this.setRequestHeader('X-Client-Fingerprint', fingerprint);
    return originalSend.apply(this, arguments);
  };

  console.log('[Fingerprint] Client fingerprint initialized');
})();
