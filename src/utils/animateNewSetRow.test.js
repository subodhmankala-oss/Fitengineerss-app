// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { animateNewSetRow } from './animateNewSetRow';

// rAF runs the callback straight away so the test can check the result.
vi.stubGlobal('requestAnimationFrame', cb => { cb(); return 0; });

const build = (html) => { document.body.innerHTML = html; return document.querySelector('button'); };

describe('animateNewSetRow', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('animates the last set row when Add Set sits straight in the card (coach plan editor)', () => {
    const btn = build(`
      <div class="ex-reorder-row"><div class="hevy-set-row" id="a"></div><div class="hevy-set-row" id="b"></div><button>Add Set</button></div>
      <div class="ex-reorder-row"><div class="hevy-set-row" id="other"></div></div>`);
    animateNewSetRow(btn);
    expect(document.getElementById('b').classList.contains('set-row-enter')).toBe(true);
    expect(document.getElementById('other').classList.contains('set-row-enter')).toBe(false);
  });

  it('still works with the .ex-card-actions wrapper (client logger / Live Log)', () => {
    const btn = build(`
      <div class="ex-reorder-row"><div class="hevy-set-row" id="a"></div><div class="hevy-set-row" id="b"></div>
      <div class="ex-card-actions"><button>Add Set</button></div></div>`);
    animateNewSetRow(btn);
    expect(document.getElementById('b').classList.contains('set-row-enter')).toBe(true);
  });
});
