// Viewport / safe-area diagnostic overlay.
//
// Why this exists: the status-bar-overlap and bottom-gap bugs only reproduce
// on real phones in installed-PWA (standalone) mode. They are invisible in
// every desktop browser tool, so several rounds of fixes were made by
// inferring geometry from screenshots — and each one was wrong in a
// different way. This prints the actual numbers off the actual device so a
// fix can be based on measurement instead of inference.
//
// Activation is deliberately sticky. An installed PWA launches at the
// manifest's start_url ("/") with no query string, so a plain ?diag=1 could
// never be seen in the one mode that matters. Visiting ?diag=1 once records
// the flag; every later launch — including from the home screen icon —
// shows the overlay until ?diag=0 clears it.
//
// This module is only ever loaded behind that flag via dynamic import (see
// main.jsx), so it contributes nothing to the normal bundle.

const FLAG_KEY = 'fe_viewport_diag';

export function isDiagEnabled() {
  try {
    const q = new URLSearchParams(window.location.search).get('diag');
    if (q === '1') {
      localStorage.setItem(FLAG_KEY, '1');
      return true;
    }
    if (q === '0') {
      localStorage.removeItem(FLAG_KEY);
      return false;
    }
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

// Reads the four safe-area insets as real, resolved pixel values. env() can
// only be read through a element that actually uses it, hence the probe.
function readEnvInsets() {
  const probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:0', 'height:0',
    'visibility:hidden', 'pointer-events:none',
    'padding-top:env(safe-area-inset-top,0px)',
    'padding-right:env(safe-area-inset-right,0px)',
    'padding-bottom:env(safe-area-inset-bottom,0px)',
    'padding-left:env(safe-area-inset-left,0px)',
  ].join(';');
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = {
    top: cs.paddingTop,
    right: cs.paddingRight,
    bottom: cs.paddingBottom,
    left: cs.paddingLeft,
  };
  probe.remove();
  return out;
}

function displayMode() {
  const modes = ['standalone', 'fullscreen', 'minimal-ui', 'browser'];
  const hit = modes.find((m) => window.matchMedia(`(display-mode: ${m})`).matches);
  // navigator.standalone is iOS-only and is the more reliable signal there:
  // older iOS reports display-mode incorrectly for home-screen launches.
  const iosStandalone = typeof navigator.standalone === 'boolean' ? String(navigator.standalone) : 'n/a';
  return `${hit || 'unknown'} (iOS navigator.standalone: ${iosStandalone})`;
}

function collect() {
  const vv = window.visualViewport;
  const el = document.querySelector('.app-container');
  const rect = el ? el.getBoundingClientRect() : null;
  const cs = el ? getComputedStyle(el) : null;
  const rootStyle = getComputedStyle(document.documentElement);
  const env = readEnvInsets();

  // The number that actually matters for the bottom gap: how far the app
  // frame's bottom edge sits from the bottom of the visible viewport. A
  // positive value is empty space below the app (the reported gap); a
  // negative value means the frame runs off-screen past the fold.
  const visibleH = vv?.height ?? window.innerHeight;
  const gapBelow = rect ? Math.round((visibleH - rect.bottom) * 10) / 10 : null;

  return [
    ['display mode', displayMode()],
    ['screen', `${screen.width}x${screen.height} @${window.devicePixelRatio}x`],
    ['window.inner', `${window.innerWidth}x${window.innerHeight}`],
    ['docEl.client', `${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`],
    ['visualViewport', vv ? `${Math.round(vv.width)}x${Math.round(vv.height)}` : 'unsupported'],
    ['vv.offsetTop', vv ? String(Math.round(vv.offsetTop)) : '—'],
    ['vv.pageTop', vv ? String(Math.round(vv.pageTop)) : '—'],
    ['vv.scale', vv ? String(vv.scale) : '—'],
    ['env inset top', env.top],
    ['env inset bottom', env.bottom],
    ['--app-safe-top', rootStyle.getPropertyValue('--app-safe-top').trim() || '(unset)'],
    ['--app-safe-bottom', rootStyle.getPropertyValue('--app-safe-bottom').trim() || '(unset)'],
    ['--app-vh x100', (() => {
      const raw = rootStyle.getPropertyValue('--app-vh').trim();
      const n = parseFloat(raw);
      return raw ? `${raw} -> ${Number.isFinite(n) ? Math.round(n * 100) : '?'}px` : '(unset)';
    })()],
    ['container height', cs ? cs.height : 'no .app-container'],
    ['container padTop', cs ? cs.paddingTop : '—'],
    ['container rect.top', rect ? String(Math.round(rect.top)) : '—'],
    ['container rect.bot', rect ? String(Math.round(rect.bottom)) : '—'],
    ['GAP BELOW APP', gapBelow === null ? '—' : `${gapBelow}px`],
    ['body height', getComputedStyle(document.body).height],
    ['#root height', (() => {
      const r = document.getElementById('root');
      return r ? getComputedStyle(r).height : '—';
    })()],
  ];
}

export function mountViewportDiag() {
  if (document.getElementById('fe-viewport-diag')) return;

  const box = document.createElement('div');
  box.id = 'fe-viewport-diag';
  box.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0',
    'z-index:2147483647',
    'background:rgba(0,0,0,0.88)', 'color:#0f0',
    'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
    'padding:6px 8px', 'max-height:62vh', 'overflow:auto',
    '-webkit-overflow-scrolling:touch',
    'border-bottom:1px solid #0f0',
  ].join(';');

  const rows = document.createElement('div');
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:6px;margin-top:6px';

  const mkBtn = (label, onClick) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'flex:1;background:#0f0;color:#000;border:0;border-radius:4px;padding:6px;font:700 11px ui-monospace,monospace';
    b.onclick = onClick;
    return b;
  };

  const render = () => {
    const data = collect();
    rows.innerHTML = data
      .map(([k, v]) => {
        // Highlight the one derived number the whole bottom-gap question
        // turns on, so it is unmistakable in a screenshot.
        const hot = k === 'GAP BELOW APP';
        return `<div style="display:flex;justify-content:space-between;gap:8px${hot ? ';color:#ff0;font-weight:700' : ''}"><span>${k}</span><span>${v}</span></div>`;
      })
      .join('');
  };

  bar.appendChild(mkBtn('REFRESH', render));
  bar.appendChild(
    mkBtn('COPY', async () => {
      const text = collect().map(([k, v]) => `${k}: ${v}`).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        alert('Copied. Paste it into the chat.');
      } catch {
        // Clipboard API needs a secure context / permission and silently
        // fails in some in-app browsers — a screenshot still works.
        alert(text);
      }
    })
  );
  bar.appendChild(
    mkBtn('HIDE', () => {
      try { localStorage.removeItem(FLAG_KEY); } catch { /* ignore */ }
      box.remove();
    })
  );

  box.appendChild(rows);
  box.appendChild(bar);
  document.body.appendChild(box);
  render();

  // Re-render on anything that can change the geometry, so the panel can be
  // screenshotted mid-keyboard or after rotation and still be accurate.
  window.addEventListener('resize', render);
  window.addEventListener('orientationchange', render);
  window.visualViewport?.addEventListener('resize', render);
  window.visualViewport?.addEventListener('scroll', render);
}
