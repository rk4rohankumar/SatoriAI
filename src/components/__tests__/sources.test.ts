import { matchCitedSources } from '../sources';

const results = [
  { title: 'BBC Weather Delhi', url: 'https://bbc.com/weather/delhi' },
  { title: 'Some Blog', url: 'https://obscure.example/post' },
];

test('matches by domain substring', () => {
  expect(matchCitedSources('Per bbc.com it will rain.', results)).toEqual([results[0]]);
});

test('matches by title substring, case-insensitive', () => {
  expect(matchCitedSources('according to bbc weather delhi...', results)).toEqual([results[0]]);
});

test('no match → empty array', () => {
  expect(matchCitedSources('It will rain.', results)).toEqual([]);
});
