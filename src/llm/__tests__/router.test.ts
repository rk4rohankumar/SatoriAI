import { decideRoute } from '../router';
import type { ChatRequest } from '../types';

const req = (over: Partial<ChatRequest> = {}): ChatRequest => ({
  messages: [{ role: 'user', content: 'hi' }],
  conversationId: 'c1',
  ...over,
});

test('explicit local wins over consent', () => {
  expect(decideRoute(req({ preferredRoute: 'local' }), { cloudConsent: true })).toBe('local');
});

test('explicit cloud wins without consent', () => {
  expect(decideRoute(req({ preferredRoute: 'cloud' }), { cloudConsent: false })).toBe('cloud');
});

test('no consent → local', () => {
  expect(decideRoute(req(), { cloudConsent: false })).toBe('local');
});

test('consent → cloud, even for short input', () => {
  expect(decideRoute(req(), { cloudConsent: true })).toBe('cloud');
});
