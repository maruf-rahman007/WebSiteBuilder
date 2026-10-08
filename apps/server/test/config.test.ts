import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('starts with only the API key set', () => {
    const config = loadConfig({ OPENROUTER_API_KEY: 'k' });
    expect(config.openRouter.models.length).toBeGreaterThan(0);
    expect(config.openRouter.fallbackModels.length).toBeGreaterThan(0);
    expect(config.port).toBe(8787);
  });

  it('treats empty model lists as unset', () => {
    const config = loadConfig({ OPENROUTER_API_KEY: 'k', OPENROUTER_MODELS: ' , ' });
    expect(config.openRouter.models.length).toBeGreaterThan(0);
  });

  it('honours an explicit model list', () => {
    const config = loadConfig({ OPENROUTER_API_KEY: 'k', OPENROUTER_MODELS: 'a/b, c/d' });
    expect(config.openRouter.models).toEqual(['a/b', 'c/d']);
  });

  it('fails clearly without an API key', () => {
    expect(() => loadConfig({})).toThrow(/OPENROUTER_API_KEY/);
  });
});
