import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { AppError } from '../src/errors.js';
import { createLogger } from '../src/logger.js';
import { FakeProvider, parseSseEvents, scripted, testConfig } from './helpers.js';

const validBody = {
  messages: [{ role: 'user', content: 'Build a counter' }],
  files: { 'package.json': '{}', 'src/App.tsx': 'export default () => null;' },
};

function makeApp(provider: FakeProvider, env: Record<string, string> = {}) {
  const config = testConfig(env);
  return createApp({ config, logger: createLogger(config), provider });
}

describe('POST /api/generate', () => {
  it('tells the user when a fallback model answered', async () => {
    const provider = new FakeProvider(
      scripted([
        { type: 'model', model: 'test/model-a' }, // same model, variant suffix dropped
        { type: 'model', model: 'other/fallback' },
        { type: 'finish', reason: 'stop' },
      ]),
    );
    const res = await request(makeApp(provider)).post('/api/generate').send(validBody);
    const warnings = parseSseEvents(res.text).filter((e) => e.type === 'run.warning');
    expect(warnings).toEqual([
      {
        type: 'run.warning',
        message: 'test/model-a:free was busy, so other/fallback answered instead.',
      },
    ]);
  });

  it('streams protocol events for a successful generation', async () => {
    const provider = new FakeProvider(
      scripted([
        { type: 'reasoning', text: 'thinking' },
        {
          type: 'content',
          text: 'Sure.\n<artifact title="Counter"><action type="file" path="src/App.tsx">',
        },
        { type: 'content', text: 'export default function App() {}\n</action></artifact>\nDone.' },
        { type: 'finish', reason: 'stop', usage: { totalTokens: 42 } },
      ]),
    );

    const res = await request(makeApp(provider)).post('/api/generate').send(validBody);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const types = parseSseEvents(res.text).map((e) => e.type);
    expect(types).toEqual([
      'run.started',
      'reasoning.delta',
      'message.delta',
      'artifact.started',
      'action.started',
      'action.delta',
      'action.completed',
      'artifact.completed',
      'message.delta',
      'run.completed',
    ]);

    const sent = provider.requests[0]!;
    expect(sent.model).toBe('test/model-a:free');
    expect(sent.messages[0]?.role).toBe('system');
    expect(sent.messages.at(-1)?.content).toContain('<file path="src/App.tsx">');
    expect(sent.messages.at(-1)?.content).toContain('Build a counter');
  });

  it('reports upstream failures as a run.error event', async () => {
    const provider = new FakeProvider(async function* () {
      yield {
        type: 'content' as const,
        text: '<artifact title="x"><action type="file" path="a.ts">partial',
      };
      throw new AppError('upstream_rate_limited', 'Slow down', { expose: true });
    });

    const res = await request(makeApp(provider)).post('/api/generate').send(validBody);
    const events = parseSseEvents(res.text);

    expect(events).toContainEqual(expect.objectContaining({ type: 'action.failed', path: 'a.ts' }));
    expect(events.at(-1)).toEqual({
      type: 'run.error',
      code: 'upstream_rate_limited',
      message: 'Slow down',
      retryable: true,
    });
  });

  it('hides internal error details from clients', async () => {
    const provider = new FakeProvider(async function* () {
      yield* [];
      throw new Error('secret stack detail');
    });
    const res = await request(makeApp(provider)).post('/api/generate').send(validBody);
    const last = parseSseEvents(res.text).at(-1);
    expect(last).toMatchObject({ type: 'run.error', code: 'internal' });
    expect(JSON.stringify(last)).not.toContain('secret');
  });

  it('rejects invalid bodies with 400 and details', async () => {
    const res = await request(makeApp(new FakeProvider(scripted([]))))
      .post('/api/generate')
      .send({
        messages: [{ role: 'assistant', content: 'hi' }],
        files: { '../x': '' },
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
    expect(res.body.error.details.length).toBeGreaterThan(0);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('rejects models outside the allowlist', async () => {
    const res = await request(makeApp(new FakeProvider(scripted([]))))
      .post('/api/generate')
      .send({ ...validBody, model: 'openai/gpt-expensive' });
    expect(res.status).toBe(400);
  });

  it('rate limits per client', async () => {
    const app = makeApp(new FakeProvider(scripted([{ type: 'finish', reason: 'stop' }])), {
      RATE_LIMIT_MAX: '1',
    });
    expect((await request(app).post('/api/generate').send(validBody)).status).toBe(200);
    const limited = await request(app).post('/api/generate').send(validBody);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate_limited');
  });

  it('times out when the model goes idle', async () => {
    const provider = new FakeProvider(async function* (req) {
      yield { type: 'content' as const, text: 'hi' };
      await new Promise((_, reject) =>
        req.signal.addEventListener('abort', () => reject(req.signal.reason)),
      );
    });
    const res = await request(makeApp(provider, { UPSTREAM_IDLE_TIMEOUT_MS: '50' }))
      .post('/api/generate')
      .send(validBody);
    expect(parseSseEvents(res.text).at(-1)).toMatchObject({
      type: 'run.error',
      code: 'timeout',
      retryable: true,
    });
  });
});

describe('GET /api/models', () => {
  it('lists configured models with the default first', async () => {
    const res = await request(makeApp(new FakeProvider(scripted([])))).get('/api/models');
    expect(res.body).toEqual({
      defaultModel: 'test/model-a:free',
      models: [
        { id: 'test/model-a:free', label: 'Model A (free)' },
        { id: 'test/model-b:free', label: 'Model B (free)' },
      ],
    });
  });
});
