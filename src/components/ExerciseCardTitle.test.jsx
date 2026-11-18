import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ExerciseCardTitle from './ExerciseCardTitle';

afterEach(cleanup);

describe('ExerciseCardTitle note line', () => {
  it('shows the coach note under the name with a Note label', () => {
    render(<ExerciseCardTitle name="Lat Pulldown" note="Pull to your collarbone" onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.getByText('Note')).toBeTruthy();
    expect(screen.getByText('Pull to your collarbone')).toBeTruthy();
  });

  it('shows no Note line when there is no note', () => {
    render(<ExerciseCardTitle name="Lat Pulldown" onShowGuide={() => {}} onShowHistory={() => {}} />);
    expect(screen.queryByText('Note')).toBeNull();
  });
});
