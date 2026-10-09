import { enterDemoMode, isDemoMode } from '@kaihuman/core';
import { useEffect } from 'preact/hooks';
import { route } from 'preact-router';

/**
 * Deep-link entry point for demo mode (`/demo`). Seeds the in-memory demo and
 * redirects to the dashboard — gives a clean single-URL launch for recordings.
 */
export const DemoEntry = () => {
  useEffect(() => {
    if (!isDemoMode.value) enterDemoMode();
    route('/', true);
  }, []);
  return null;
};
