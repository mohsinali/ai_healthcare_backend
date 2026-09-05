const SPOKEN_APPOINTMENT_REFERENCE = /^APT(?:[ -]?)(\d+)$/i;

/**
 * Converts the generated `APT-<digits>` format and safe spoken separator
 * variants to one exact comparison key. Meaningful characters, including
 * zeroes, are never discarded.
 */
export function normalizeAppointmentReference(value: string): string | null {
  const match = SPOKEN_APPOINTMENT_REFERENCE.exec(value.trim());
  return match ? `APT${match[1]}` : null;
}

export function storedAppointmentReference(
  normalizedReference: string,
): string {
  return `APT-${normalizedReference.slice(3)}`;
}
