import { describe, expect, it } from 'vitest';
import { WebhookSignatureError, computeSignature, constructEvent } from '../src/index.js';
import { fixture } from './helpers/mock-fetch.js';

const RAW = fixture('webhook.job-completed.json');
const SECRET = 'whsec_test_secret';

describe('webhooks.constructEvent', () => {
  it('throws without a signature unless verify:false is explicit', () => {
    expect(() => constructEvent(RAW)).toThrow(WebhookSignatureError);
    expect(() => constructEvent(RAW)).toThrow(/verify: false/);
  });

  it('parses a job.completed payload with verify:false (verified:false)', () => {
    const event = constructEvent(RAW, null, null, { verify: false });
    expect(event.type).toBe('job.completed');
    expect(event.verified).toBe(false);
    if (event.type === 'job.completed') {
      expect(event.payload.id).toBe('job_01jf8n2q4vxw9k3m5p7r9t1v3x');
      expect(event.payload.outcome).toBe('pass');
      expect(event.payload.tasks[0]!.steps).toHaveLength(2);
    }
  });

  it('verifies an HMAC-SHA256 hex signature over the raw body', () => {
    const signature = computeSignature(SECRET, RAW);
    const event = constructEvent(RAW, signature, SECRET);
    expect(event.verified).toBe(true);
    expect(event.type).toBe('job.completed');
  });

  it('accepts Buffer bodies', () => {
    const buffer = Buffer.from(RAW, 'utf8');
    const signature = computeSignature(SECRET, buffer);
    const event = constructEvent(buffer, signature, SECRET);
    expect(event.verified).toBe(true);
  });

  it('rejects a tampered body', () => {
    const signature = computeSignature(SECRET, RAW);
    const tampered = RAW.replace('"pass"', '"fail"');
    expect(() => constructEvent(tampered, signature, SECRET)).toThrow(WebhookSignatureError);
  });

  it('rejects a wrong-length signature without leaking timing', () => {
    expect(() => constructEvent(RAW, 'deadbeef', SECRET)).toThrow(WebhookSignatureError);
  });

  it('detects job.created payloads', () => {
    const raw = JSON.stringify({
      id: 'job_1',
      status: 'pending',
      channel: 'api',
      ruleId: null,
      customerId: null,
      orderId: null,
      taskCount: 2,
      created: 1785308102000,
    });
    const event = constructEvent(raw, null, null, { verify: false });
    expect(event.type).toBe('job.created');
    if (event.type === 'job.created') expect(event.payload.taskCount).toBe(2);
  });

  it('falls back to unknown for unrecognized payloads', () => {
    const event = constructEvent('{"hello":"world"}', null, null, { verify: false });
    expect(event.type).toBe('unknown');
  });

  it('rejects non-JSON bodies', () => {
    expect(() => constructEvent('not json', null, null, { verify: false })).toThrow(
      WebhookSignatureError,
    );
  });
});
