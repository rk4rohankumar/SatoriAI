import { feedSse } from '../sse';
import type { StreamEvent } from '../types';

const collect = (chunks: string[]) => {
  const events: StreamEvent[] = [];
  let buf = '';
  for (const c of chunks) buf = feedSse(buf, c, (e) => events.push(e));
  return events;
};

test('parses token events across chunk boundaries', () => {
  const events = collect(['data: {"type":"token","te', 'xt":"hi"}\n\n']);
  expect(events).toEqual([{ type: 'token', text: 'hi' }]);
});

test('parses tool_call and tool_result', () => {
  const events = collect([
    'data: {"type":"tool_call","id":"tu_1","name":"web_search","query":"w"}\n\n',
    'data: {"type":"tool_result","id":"tu_1","count":1,"domains":["a.com"],"results":[{"title":"T","url":"https://a.com"}]}\n\n',
  ]);
  expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result']);
});

test('ignores malformed lines and unknown-but-valid JSON passes through', () => {
  const events = collect(['data: {not json}\n\ndata: {"type":"future_thing"}\n\n']);
  expect(events).toEqual([{ type: 'future_thing' } as unknown as StreamEvent]);
});
