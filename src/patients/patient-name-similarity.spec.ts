import { patientNameSimilarity } from './patient-name-similarity';

describe('patientNameSimilarity', () => {
  it.each([
    ['arthur', 'aurthur', 6 / 7],
    ['jorning', 'joerning', 7 / 8],
    ['', '', 1],
    ['', 'a', 0],
    ['al', 'el', 0.5],
  ])('scores %j and %j', (left, right, expected) => {
    expect(patientNameSimilarity(left, right)).toBeCloseTo(expected);
    expect(patientNameSimilarity(right, left)).toBeCloseTo(expected);
  });
});
