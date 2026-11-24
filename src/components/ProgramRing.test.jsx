// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ProgramRing from './ProgramRing';

describe('ProgramRing', () => {
  afterEach(cleanup);
  const draw = props => render(<ProgramRing {...props}><i /></ProgramRing>).container;

  it('has one piece per session, filled as they are done', () => {
    const el = draw({ done: 3, total: 12 });
    expect(el.querySelectorAll('.is-done')).toHaveLength(3);
    expect(el.querySelectorAll('.is-left')).toHaveLength(9);
  });

  it('never fills more than the program', () => {
    const el = draw({ done: 15, total: 12 });
    expect(el.querySelectorAll('.is-done')).toHaveLength(12);
  });

  it('is one arc for a long program, and empty at 0', () => {
    expect(draw({ done: 30, total: 100 }).querySelectorAll('circle')).toHaveLength(2);
    cleanup();
    expect(draw({ done: 0, total: 100 }).querySelectorAll('.is-done')).toHaveLength(0);
  });

  it('is just the photo when no program is set', () => {
    const el = draw({ done: 4, total: null });
    expect(el.querySelector('svg')).toBeNull();
    expect(el.querySelector('i')).not.toBeNull();
  });
});
