/**
 * Client-side browser fingerprint generation
 * Generates a unique hardware-based fingerprint that persists across incognito sessions
 */

(function() {
  let cachedFingerprint = null;

  // Generate hardware-based fingerprint
  async function generateFingerprint() {
    const components = [];

    // 1. Canvas fingerprint
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 200;
      canvas.height = 50;
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Browser Fingerprint 🎵', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Browser Fingerprint 🎵', 4, 17);
      const canvasData = canvas.toDataURL();
      components.push(canvasData);
    } catch (e) {
      components.push('canvas-error');
    }

    // 2. WebGL fingerprint
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
          components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
        }
        components.push(gl.getParameter(gl.VERSION));
        components.push(gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
      }
    } catch (e) {
      components.push('webgl-error');
    }

    // 3. Audio fingerprint
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const analyser = audioContext.createAnalyser();
      const gainNode = audioContext.createGain();
      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

      gainNode.gain.value = 0;
      oscillator.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start(0);
      const audioData = analyser.frequencyBinCount;
      components.push(audioData.toString());

      oscillator.stop();
      audioContext.close();
    } catch (e) {
      components.push('audio-error');
    }

    // 4. Screen & Hardware info
    components.push(screen.width + 'x' + screen.height);
    components.push(screen.colorDepth);
    components.push(navigator.hardwareConcurrency || 0);
    components.push(navigator.deviceMemory || 0);
    components.push(navigator.maxTouchPoints || 0);

    // 5. Platform & Browser info
    components.push(navigator.platform);
    components.push(navigator.userAgent);
    components.push(navigator.language);
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // 6. Installed fonts detection
    const fonts = ['Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 'Trebuchet MS', 'Impact'];
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const testString = 'mmmmmmmmmmlli';
    const testSize = '72px';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const baselines = {};
    for (const baseFont of baseFonts) {
      ctx.font = testSize + ' ' + baseFont;
      baselines[baseFont] = ctx.measureText(testString).width;
    }

    const detectedFonts = [];
    for (const font of fonts) {
      for (const baseFont of baseFonts) {
        ctx.font = testSize + ' ' + font + ', ' + baseFont;
        const width = ctx.measureText(testString).width;
        if (width !== baselines[baseFont]) {
          detectedFonts.push(font);
          break;
        }
      }
    }
    components.push(detectedFonts.join(','));

    // Hash all components together
    const fingerprintString = components.join('|');
    const fingerprint = await hashString(fingerprintString);

    return fingerprint.substring(0, 32);
  }

  // Hash string using SHA-256
  async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  // Get or create fingerprint (async)
  async function getFingerprint() {
    if (cachedFingerprint) {
      return cachedFingerprint;
    }

    cachedFingerprint = await generateFingerprint();
    console.log('[Fingerprint] Hardware-based fingerprint generated:', cachedFingerprint);
    return cachedFingerprint;
  }

  // Intercept fetch requests to add fingerprint header (async)
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const fingerprint = await getFingerprint();

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

  // Intercept XMLHttpRequest to add fingerprint header (async)
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function() {
    this._url = arguments[1];
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    const self = this;
    const args = arguments;

    // Get fingerprint asynchronously before sending
    getFingerprint().then(fingerprint => {
      self.setRequestHeader('X-Client-Fingerprint', fingerprint);
      originalSend.apply(self, args);
    }).catch(err => {
      console.error('[Fingerprint] Error getting fingerprint:', err);
      // Send anyway without fingerprint
      originalSend.apply(self, args);
    });

    // Don't call originalSend here - will be called in promise
    return;
  };

  // Pre-generate fingerprint on page load
  getFingerprint().then(() => {
    console.log('[Fingerprint] Hardware-based fingerprint initialized');
  });
})();
