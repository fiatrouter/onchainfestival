(function () {
  'use strict';

  const endpoint = '/api/track';
  const visitorKey = 'onchain-festival-visitor-id';

  function getVisitorId() {
    try {
      let visitorId = localStorage.getItem(visitorKey);
      if (!visitorId) {
        visitorId = crypto.randomUUID();
        localStorage.setItem(visitorKey, visitorId);
      }
      return visitorId;
    } catch (error) {
      return null;
    }
  }

  function track(eventType, metadata) {
    const payload = JSON.stringify({
      eventType,
      visitorId: getVisitorId(),
      path: window.location.pathname,
      referrer: document.referrer || null,
      ...metadata
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
      return;
    }

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'same-origin'
    }).catch(() => {});
  }

  track('page_view');

  document.addEventListener('click', function (event) {
    const button = event.target.closest('.frontdesk-cta-button');
    if (!button) return;

    track('registration_click', {
      buttonText: (button.textContent || '').trim().slice(0, 80)
    });
  }, { passive: true });
})();