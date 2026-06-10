(() => {
  'use strict';

  const loader = document.currentScript;
  const baseUrl = new URL('.', loader.src);

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('lead-capture.css?v=20260610-4', baseUrl).href;
  document.head.appendChild(stylesheet);

  const config = document.createElement('script');
  config.src = new URL('lead-capture-config.js?v=20260610-3', baseUrl).href;
  config.onload = () => {
    const behavior = document.createElement('script');
    behavior.src = new URL('lead-capture.js?v=20260610-3', baseUrl).href;
    document.head.appendChild(behavior);
  };
  document.head.appendChild(config);
})();
