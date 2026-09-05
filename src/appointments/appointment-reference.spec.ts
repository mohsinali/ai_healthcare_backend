import {
  normalizeAppointmentReference,
  storedAppointmentReference,
} from './appointment-reference';

describe('appointment reference normalization', () => {
  it.each(['APT-06', 'APT06', 'APT 06', 'apt-06', 'apt 06', '  APT06  '])(
    'canonicalizes %s without changing meaningful characters',
    (value) => {
      expect(normalizeAppointmentReference(value)).toBe('APT06');
    },
  );

  it.each(['APT-6', 'APT-07', 'BPT-06', 'APT-006'])(
    'does not equate a different reference %s',
    (value) => {
      expect(normalizeAppointmentReference(value)).not.toBe('APT06');
    },
  );

  it.each(['APT_06', 'APT/06', 'APT--06', 'APT  06', '06', 'APT'])(
    'rejects structurally unsafe or unreasonable input %s',
    (value) => {
      expect(normalizeAppointmentReference(value)).toBeNull();
    },
  );

  it('reconstructs the only generated storage representation', () => {
    expect(storedAppointmentReference('APT06')).toBe('APT-06');
  });
});
