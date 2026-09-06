import {
  InvalidWebOriginError,
  isWebOriginAllowed,
  normalizeWebOrigin,
  normalizeWebOrigins,
} from './web-origin-policy';

describe('web origin policy', () => {
  it.each([
    ['https://EXAMPLE.com/', 'https://example.com'],
    ['https://example.com:443', 'https://example.com'],
    ['http://example.com:80', 'http://example.com'],
    ['https://example.com:8443/', 'https://example.com:8443'],
    [' http://localhost:3001/ ', 'http://localhost:3001'],
    ['http://127.0.0.1:3001', 'http://127.0.0.1:3001'],
    ['http://[::1]:3001', 'http://[::1]:3001'],
    ['https://münich.example', 'https://xn--mnich-kva.example'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeWebOrigin(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'null',
    'example.com',
    'https:example.com',
    'https:/example.com',
    'ftp://example.com',
    'javascript:alert(1)',
    'https://example.com/path',
    'https://example.com?x=1',
    'https://example.com#section',
    'https://user@example.com',
    'https://user:pass@example.com',
    '*.example.com',
    'https://*.example.com',
    'not a url',
    'https://example.com:99999',
    'https://example.com:',
  ])('rejects %p', (input) => {
    expect(() => normalizeWebOrigin(input)).toThrow(InvalidWebOriginError);
  });

  it('deduplicates canonical values and stores deterministic order', () => {
    expect(
      normalizeWebOrigins([
        'https://B.example:443/',
        'https://a.example',
        'https://b.example',
      ]),
    ).toEqual(['https://a.example', 'https://b.example']);
  });

  it.each([
    ['https://clinic.com', true],
    ['https://CLINIC.com:443/', true],
    ['http://clinic.com', false],
    ['https://clinic.com:8443', false],
    ['https://sub.clinic.com', false],
    ['https://evilclinic.com', false],
    ['https://clinic.com.evil.example', false],
    ['', false],
    ['malformed', false],
  ])('authorizes %p with exact matching only', (request, expected) => {
    expect(
      isWebOriginAllowed(request, [
        'https://clinic.com',
        'https://CLINIC.com:443',
      ]),
    ).toBe(expected);
  });

  it('fails closed for a missing origin, empty list, or invalid stored value', () => {
    expect(isWebOriginAllowed(undefined, ['https://clinic.com'])).toBe(false);
    expect(isWebOriginAllowed('https://clinic.com', [])).toBe(false);
    expect(isWebOriginAllowed('https://clinic.com', ['*'])).toBe(false);
  });
});
