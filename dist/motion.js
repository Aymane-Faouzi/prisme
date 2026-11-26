(() => {
  'use strict';

  const device = document.querySelector('.calculator');
  const grip = document.getElementById('grip');
  const tray = document.getElementById('loose-keys');
  const restore = document.getElementById('restore-keys');
  const sound = document.getElementById('sound');
  const announcement = document.getElementById('physical-status');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 53rem)');
  const looseKeys = new Map();
  const clamp = (value, limit) => Math.min(limit, Math.max(-limit, value));
  let topLayer = 0;

  let audio;
  let soundOn = false;
  try { soundOn = localStorage.getItem('prisme:physical-sound') === 'on'; } catch {}
  sound.setAttribute('aria-pressed', String(soundOn));
  sound.addEventListener('click', () => {
    soundOn = !soundOn;
    sound.setAttribute('aria-pressed', String(soundOn));
    try { localStorage.setItem('prisme:physical-sound', soundOn ? 'on' : 'off'); } catch {}
    play('snap');
  });

  function play(kind) {
    if (!soundOn || !window.AudioContext) return;
    try {
      audio ??= new AudioContext();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const now = audio.currentTime;
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      const pitch = { press: [235, 100, .065], pull: [440, 125, .11], snap: [520, 155, .08], flip: [320, 160, .08] }[kind];
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(pitch[0], now);
      oscillator.frequency.exponentialRampToValueAtTime(pitch[1], now + pitch[2]);
      envelope.gain.setValueAtTime(.12, now);
      envelope.gain.exponentialRampToValueAtTime(.001, now + pitch[2]);
      oscillator.connect(envelope).connect(audio.destination);
      oscillator.start(now);
      oscillator.stop(now + pitch[2]);
    } catch { /* Sound is optional. */ }
  }

  function spring(from, target, speed, paint, done) {
    const position = [...from];
    const velocity = position.map((_, index) => speed[index] ?? 0);
    let frame;
    let previous = performance.now();

    function step(now) {
      const seconds = Math.min((now - previous) / 1000, .032);
      previous = now;
      let settled = true;
      for (let i = 0; i < position.length; i++) {
        velocity[i] += ((target[i] - position[i]) * 180 - velocity[i] * 19) * seconds;
        position[i] += velocity[i] * seconds;
        settled &&= Math.abs(position[i] - target[i]) < .24 && Math.abs(velocity[i]) < 2;
      }
      if (settled || reducedMotion.matches) finish();
      else {
        paint(position);
        frame = requestAnimationFrame(step);
      }
    }

    function finish() {
      paint(target);
      done?.();
    }

    if (reducedMotion.matches) finish();
    else frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }

  function particles(x, y) {
    if (reducedMotion.matches) return;
    const burst = document.createElement('span');
    burst.className = 'spring-burst';
    burst.style.left = x + 'px';
    burst.style.top = y + 'px';
    burst.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 7; i++) {
      const spark = document.createElement('i');
      const angle = i * 2 * Math.PI / 7;
      const distance = i % 2 ? 25 : 39;
      spark.style.setProperty('--spark-x', Math.cos(angle) * distance + 'px');
      spark.style.setProperty('--spark-y', Math.sin(angle) * distance + 'px');
      burst.append(spark);
    }
    document.body.append(burst);
    setTimeout(() => burst.remove(), 430);
  }

  function centerOf(button) {
    const bounds = button.getBoundingClientRect();
    return [bounds.left + bounds.width / 2, bounds.top + bounds.height / 2];
  }

  function keepVisible(cap, x, y) {
    const horizontal = Math.min(cap.width * .54, innerWidth / 2);
    const vertical = Math.min(cap.height * .65, innerHeight / 2);
    return [
      Math.max(horizontal, Math.min(innerWidth - horizontal, x)),
      Math.max(vertical, Math.min(innerHeight - vertical, y))
    ];
  }

  function paintCap(cap, pose) {
    cap.pose = [...pose];
    const [x, y, roll, pitch, yaw] = pose;
    cap.element.style.setProperty('--loose-x', x + 'px');
    cap.element.style.setProperty('--loose-y', y + 'px');
    cap.element.style.setProperty('--roll', roll + 'deg');
    cap.element.style.setProperty('--pitch', pitch + 'deg');
    cap.element.style.setProperty('--yaw', yaw + 'deg');
  }

  function glideCap(cap, target, speed = [], done) {
    cap.stop?.();
    cap.stop = spring(cap.pose, target, speed, (pose) => paintCap(cap, pose), done);
  }

  function updateTray() {
    tray.hidden = restore.hidden = !looseKeys.size;
    restore.textContent = looseKeys.size > 1 ? 'Remonter les touches (' + looseKeys.size + ')' : 'Remonter la touche';
  }

  function attach(cap, { instant = false, focus = document.activeElement === cap.element } = {}) {
    if (cap.attaching) return;
    const { anchor, element, name } = cap;
    cap.attaching = true;
    cap.stop?.();
    delete anchor.dataset.docking;
    const [x, y] = centerOf(anchor);

    function finish() {
      looseKeys.delete(anchor);
      element.remove();
      delete anchor.dataset.detached;
      updateTray();
      announcement.textContent = name + ' remontée.';
      if (focus && anchor.getClientRects().length) anchor.focus({ preventScroll: true });
    }

    if (instant || !anchor.getClientRects().length || y < 0 || y > innerHeight) finish();
    else {
      element.dataset.attaching = '';
      particles(x, y);
      play('snap');
      const [,, roll,, yaw] = cap.pose;
      glideCap(cap, [x, y, Math.round(roll / 360) * 360, 0, Math.round(yaw / 360) * 360], [], finish);
    }
  }

  function nearSocket(cap, x, y) {
    const bounds = cap.anchor.getBoundingClientRect();
    return bounds.width > 0 && x >= bounds.left - 10 && x <= bounds.right + 10 &&
      y >= bounds.top - 10 && y <= bounds.bottom + 10;
  }

  function moveLoose(cap, drag) {
    const [x, y] = keepVisible(cap, drag.pose[0] + drag.dx, drag.pose[1] + drag.dy);
    const [, , roll, pitch, yaw] = drag.pose;
    const twist = drag.twist ? drag.dx * 1.5 : clamp(drag.dx * .3, 34);
    paintCap(cap, [
      drag.twist ? drag.pose[0] : x,
      drag.twist ? drag.pose[1] : y,
      drag.twist || !reducedMotion.matches ? roll + twist : roll,
      reducedMotion.matches ? pitch : pitch + clamp(-drag.vy * 22, 34),
      drag.twist ? yaw + drag.dy * .85 : yaw
    ]);
    cap.anchor.toggleAttribute('data-docking', nearSocket(cap, cap.pose[0], cap.pose[1]));
  }

  function releaseLoose(cap, drag, returning = true) {
    if (!looseKeys.has(cap.anchor) || cap.attaching) return;
    delete cap.element.dataset.carried;
    delete cap.anchor.dataset.docking;
    const [x, y, roll, pitch, yaw] = cap.pose;
    if (returning && nearSocket(cap, x, y)) {
      attach(cap);
      return;
    }
    const vx = drag?.vx ?? 0;
    const vy = drag?.vy ?? 0;
    const glide = reducedMotion.matches || drag?.twist ? 0 : 75;
    const [nextX, nextY] = keepVisible(cap, x + vx * glide, y + vy * glide);
    glideCap(cap, [nextX, nextY, roll + vx * glide * .22, drag?.pose[3] ?? pitch, yaw], [vx * 220, vy * 220, vx * 70]);
  }

  function detach(anchor, label, x, y) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'loose-cap';
    for (const variant of ['operator', 'equal', 'function']) {
      element.classList.toggle(variant, anchor.classList.contains(variant));
    }
    const name = anchor.getAttribute('aria-label') ?? label.textContent.trim();
    element.setAttribute('aria-label', 'Touche ' + name + '. Entrée pour retourner, flèches pour tourner, Échap pour remonter.');
    element.title = 'Toucher pour retourner. Glisser pour déplacer. Maj + glisser pour faire pivoter.';
    const object = document.createElement('span');
    object.className = 'loose-object';
    object.setAttribute('aria-hidden', 'true');
    const face = document.createElement('span');
    face.className = 'loose-face';
    face.append(label.cloneNode(true));
    const underside = document.createElement('span');
    underside.className = 'loose-underside';
    object.append(face, underside);
    element.append(object);

    const bounds = anchor.getBoundingClientRect();
    const cap = { anchor, element, name, width: bounds.width, height: bounds.height };
    element.style.width = cap.width + 'px';
    element.style.height = cap.height + 'px';
    element.style.zIndex = ++topLayer;
    paintCap(cap, [...keepVisible(cap, x, y), -8, -10, 0]);
    looseKeys.set(anchor, cap);
    anchor.dataset.detached = '';
    tray.append(element);
    updateTray();
    particles(...centerOf(anchor));
    play('pull');
    announcement.textContent = 'Touche ' + name + ' détachée.';

    trackDrag(element, {
      start(event, drag) {
        cap.stop?.();
        drag.pose = [...cap.pose];
        drag.twist = event.shiftKey;
        element.dataset.carried = '';
        element.style.zIndex = ++topLayer;
      },
      move(_event, drag) { if (drag?.moved) moveLoose(cap, drag); },
      end(_event, _inside, drag) {
        delete element.dataset.carried;
        if (drag.moved) releaseLoose(cap, drag);
      }
    });

    element.addEventListener('click', () => {
      const [x, y, roll, pitch, yaw] = cap.pose;
      glideCap(cap, [x, y, roll + 18, pitch, (Math.round(yaw / 180) + 1) * 180]);
      play('flip');
    });

    element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        attach(cap, { focus: true });
      }
      const change = { ArrowLeft: [-25, 0], ArrowRight: [25, 0], ArrowUp: [0, -25], ArrowDown: [0, 25] }[event.key];
      if (!change) return;
      event.preventDefault();
      const [x, y, roll, pitch, yaw] = cap.pose;
      glideCap(cap, [x, y, roll + change[0], pitch + change[1], yaw]);
    });
    return cap;
  }

  function addKeycap(button) {
    const cap = document.createElement('span');
    const label = document.createElement('span');
    cap.className = 'keycap';
    label.className = 'key-label';
    label.append(...button.childNodes);
    cap.append(label);
    button.append(cap);

    // Scientific angle changes can also update a loose copy of the label.
    if (button.id === 'angle') {
      new MutationObserver(() => {
        const looseLabel = looseKeys.get(button)?.element.querySelector('.key-label');
        if (looseLabel) looseLabel.textContent = label.textContent;
      }).observe(label, { childList: true, characterData: true, subtree: true });
    }

    let strikeTimer;
    button.addEventListener('click', () => play('press'));
    button.addEventListener('key-strike', () => {
      button.dataset.struck = '';
      clearTimeout(strikeTimer);
      strikeTimer = setTimeout(() => delete button.dataset.struck, 135);
      play('press');
    });
    button.setAttribute('aria-keyshortcuts', 'Shift+Enter');
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (looseKeys.has(button)) attach(looseKeys.get(button));
      else {
        const [x, y] = centerOf(button);
        detach(button, label, x - 50, y - 58).element.focus({ preventScroll: true });
      }
    });

    function aim(event) {
      if (reducedMotion.matches || event.pointerType === 'touch' || button.hasAttribute('data-detached')) return;
      const bounds = button.getBoundingClientRect();
      const x = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, 1);
      const y = clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, 1);
      button.dataset.pointed = '';
      cap.style.setProperty('--key-rx', -y * 12 + 'deg');
      cap.style.setProperty('--key-ry', x * 12 + 'deg');
      cap.style.setProperty('--light-x', 50 + x * 46 + '%');
      cap.style.setProperty('--light-y', 40 + y * 40 + '%');
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
        if (!drag.loose && !looseKeys.has(button) && Math.hypot(drag.dx, drag.dy) >= 39) {
          drag.loose = detach(button, label, drag.x, drag.y);
          drag.pose = [...drag.loose.pose];
          drag.loose.element.dataset.carried = '';
        }
        if (drag.loose) {
          moveLoose(drag.loose, drag);
          return;
        }
        if (reducedMotion.matches) return;
        cap.style.setProperty('--key-x', clamp(drag.dx * .24, 10) + 'px');
        cap.style.setProperty('--drag-y', clamp(drag.dy * .18, 6) + 'px');
        cap.style.setProperty('--key-rx', clamp(-drag.dy * .6, 17) + 'deg');
        cap.style.setProperty('--key-ry', clamp(drag.dx * .6, 17) + 'deg');
      },
      end(event, inside, drag) {
        resetKey();
        if (drag.loose) releaseLoose(drag.loose, drag);
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
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, vx: 0, vy: 0, time: event.timeStamp, moved: false };
      dragListeners = new AbortController();
      const options = { signal: dragListeners.signal };
      window.addEventListener('pointermove', follow, options);
      window.addEventListener('pointerup', finish, options);
      window.addEventListener('pointercancel', finish, options);
      window.addEventListener('blur', finish, options);
      button.setPointerCapture(event.pointerId);
      start(event, drag);
    });

    function update(event) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      const elapsed = Math.max(event.timeStamp - drag.time, 8);
      if (dx !== drag.dx || dy !== drag.dy) {
        drag.vx = clamp(drag.vx * .25 + (dx - drag.dx) / elapsed * .75, 2.5);
        drag.vy = clamp(drag.vy * .25 + (dy - drag.dy) / elapsed * .75, 2.5);
        drag.time = event.timeStamp;
      } else if (elapsed > 100) drag.vx = drag.vy = 0;
      drag.dx = dx;
      drag.dy = dy;
      drag.moved ||= Math.hypot(dx, dy) > 7;
    }

    button.addEventListener('pointermove', (event) => { if (!drag) move(event); });

    function follow(event) {
      if (drag?.id !== event.pointerId) return;
      update(event);
      move(event, drag);
    }

    function finish(event) {
      if (!drag || (event.type !== 'blur' && drag.id !== event.pointerId)) return;
      const released = event.type === 'pointerup';
      if (released) update(event);
      else drag.vx = drag.vy = 0;
      const inside = released && button.contains(document.elementFromPoint(event.clientX, event.clientY));
      suppressClick = drag.moved || !inside;
      dragListeners.abort();
      const ended = drag;
      drag = undefined;
      end(event, inside, ended);
    }

    button.addEventListener('click', (event) => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });
  }

  document.querySelectorAll('[data-key]').forEach(addKeycap);
  restore.addEventListener('click', () => {
    const keys = [...looseKeys.values()];
    keys.forEach((cap, index) => attach(cap, { instant: keys.length > 4, focus: index === 0 }));
  });
  window.addEventListener('resize', () => {
    for (const cap of looseKeys.values()) {
      if (cap.attaching) continue;
      cap.stop?.();
      paintCap(cap, [...keepVisible(cap, ...cap.pose), ...cap.pose.slice(2)]);
    }
  });

  let orientation;
  let stopCase;
  const rest = () => compact.matches ? [1, 0, 0] : [3, -3, 0];
  const limitCase = (x, y, roll) => [clamp(x, compact.matches ? 13 : 23), clamp(y, compact.matches ? 14 : 29), clamp(roll, compact.matches ? 3 : 8)];

  function setOrientation(pose) {
    orientation = [...pose];
    device.style.setProperty('--case-x', pose[0] + 'deg');
    device.style.setProperty('--case-y', pose[1] + 'deg');
    device.style.setProperty('--case-roll', pose[2] + 'deg');
  }

  function settleCase(target, speed = []) {
    stopCase?.();
    device.dataset.turning = '';
    stopCase = spring(orientation ?? rest(), target, speed, setOrientation, () => delete device.dataset.turning);
  }

  trackDrag(grip, {
    start(_event, drag) {
      stopCase?.();
      drag.pose = orientation ?? rest();
      device.dataset.turning = '';
    },
    move(_event, drag) {
      if (!drag?.moved || reducedMotion.matches) return;
      const [x, y, roll] = drag.pose;
      setOrientation(limitCase(x + drag.dy * .19, y + drag.dx * .19, roll + drag.dx * .045));
    },
    end(_event, _inside, drag) {
      delete device.dataset.turning;
      if (!drag.moved || reducedMotion.matches) return;
      const [x, y, roll] = orientation ?? rest();
      settleCase(limitCase(x + drag.vy * 6, y + drag.vx * 7, roll + drag.vx * 2), [drag.vy * 80, drag.vx * 85, drag.vx * 28]);
    }
  });

  grip.addEventListener('click', () => settleCase(rest()));
  grip.addEventListener('keydown', (event) => {
    const directions = { ArrowUp: [-4, 0], ArrowDown: [4, 0], ArrowLeft: [0, -4], ArrowRight: [0, 4] };
    const delta = directions[event.key];
    if (!delta) return;
    event.preventDefault();
    const [x, y, roll] = orientation ?? rest();
    settleCase(limitCase(x + delta[0], y + delta[1], roll));
  });

  function applyMotionPreference() {
    grip.hidden = reducedMotion.matches;
    if (reducedMotion.matches) settleCase(rest());
  }

  reducedMotion.addEventListener('change', applyMotionPreference);
  applyMotionPreference();
})();
