(() => {
  'use strict';

  const device = document.querySelector('.calculator');
  const grip = document.getElementById('grip');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, limit) => Math.min(limit, Math.max(-limit, value));

  // Keep the hit area stationary while the keycap moves above it.
  function addKeycap(button) {
    const cap = document.createElement('span');
    const label = document.createElement('span');
    cap.className = 'keycap';
    label.className = 'key-label';
    label.append(...button.childNodes);
    cap.append(label);
    button.append(cap);

    let strikeTimer;
    button.addEventListener('key-strike', () => {
      button.dataset.struck = '';
      clearTimeout(strikeTimer);
      strikeTimer = setTimeout(() => delete button.dataset.struck, 135);
    });

    function aim(event) {
      if (reducedMotion.matches || event.pointerType === 'touch') return;
      const bounds = button.getBoundingClientRect();
      const x = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, 1);
      const y = clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, 1);
      button.dataset.pointed = '';
      cap.style.setProperty('--key-rx', `${-y * 12}deg`);
      cap.style.setProperty('--key-ry', `${x * 12}deg`);
      cap.style.setProperty('--light-x', `${50 + x * 46}%`);
      cap.style.setProperty('--light-y', `${40 + y * 40}%`);
    }

    function resetKey() {
      delete button.dataset.pointed;
      delete button.dataset.held;
      cap.removeAttribute('style');
    }

    button.addEventListener('pointerenter', aim);
    button.addEventListener('pointerleave', () => {
      if (!button.hasAttribute('data-held')) resetKey();
    });

    trackDrag(button, {
      start() { button.dataset.held = ''; },
      move(event, drag) {
        if (!drag) return aim(event);
        if (reducedMotion.matches) return;
        cap.style.setProperty('--key-x', `${clamp(drag.dx * .2, 8)}px`);
        cap.style.setProperty('--drag-y', `${clamp(drag.dy * .16, 4)}px`);
        cap.style.setProperty('--key-rx', `${clamp(-drag.dy * .6, 15)}deg`);
        cap.style.setProperty('--key-ry', `${clamp(drag.dx * .6, 15)}deg`);
      },
      end(event, inside) {
        resetKey();
        if (inside) aim(event);
      }
    });
  }

  function trackDrag(button, { start, move, end }) {
    let drag;
    let dragListeners;
    let suppressClick = false;

    button.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      suppressClick = false;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, moved: false };
      dragListeners = new AbortController();
      const options = { signal: dragListeners.signal };
      window.addEventListener('pointermove', follow, options);
      window.addEventListener('pointerup', finish, options);
      window.addEventListener('pointercancel', finish, options);
      window.addEventListener('blur', finish, options);
      button.setPointerCapture(event.pointerId);
      start();
    });

    function update(event) {
      drag.dx = event.clientX - drag.x;
      drag.dy = event.clientY - drag.y;
      drag.moved ||= Math.hypot(drag.dx, drag.dy) > 7;
    }

    button.addEventListener('pointermove', (event) => {
      if (!drag) move(event);
    });

    function follow(event) {
      if (drag?.id !== event.pointerId) return;
      update(event);
      move(event, drag);
    }

    function finish(event) {
      if (!drag || (event.type !== 'blur' && drag.id !== event.pointerId)) return;
      const released = event.type === 'pointerup';
      if (released) update(event);
      const inside = released && button.contains(document.elementFromPoint(event.clientX, event.clientY));
      suppressClick = drag.moved || !inside;
      dragListeners.abort();
      drag = undefined;
      end(event, inside);
    }

    button.addEventListener('click', (event) => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });
  }

  document.querySelectorAll('[data-key]').forEach(addKeycap);

  const compact = matchMedia('(max-width: 53rem)');
  let orientation;
  let startingOrientation;

  function setOrientation(x, y) {
    orientation = { x: clamp(x, 13), y: clamp(y, 15) };
    device.style.setProperty('--case-x', `${orientation.x}deg`);
    device.style.setProperty('--case-y', `${orientation.y}deg`);
  }

  function resetOrientation() {
    orientation = undefined;
    device.style.removeProperty('--case-x');
    device.style.removeProperty('--case-y');
  }

  function currentOrientation() {
    return orientation ?? (compact.matches ? { x: 1, y: 0 } : { x: 3, y: -3 });
  }

  trackDrag(grip, {
    start() { startingOrientation = currentOrientation(); },
    move(_event, drag) {
      if (!drag?.moved || reducedMotion.matches) return;
      device.dataset.turning = '';
      setOrientation(startingOrientation.x + drag.dy * .15, startingOrientation.y + drag.dx * .13);
    },
    end() { delete device.dataset.turning; }
  });

  grip.addEventListener('click', resetOrientation);
  grip.addEventListener('keydown', (event) => {
    const directions = { ArrowUp: [-3, 0], ArrowDown: [3, 0], ArrowLeft: [0, -3], ArrowRight: [0, 3] };
    const delta = directions[event.key];
    if (!delta) return;
    event.preventDefault();
    const { x, y } = currentOrientation();
    setOrientation(x + delta[0], y + delta[1]);
  });

  function applyMotionPreference() {
    grip.hidden = reducedMotion.matches;
    document.querySelector('.intro p').hidden = reducedMotion.matches;
    if (reducedMotion.matches) resetOrientation();
  }

  reducedMotion.addEventListener('change', applyMotionPreference);
  applyMotionPreference();
})();
