import { AppointmentStatus } from '@prisma/client';
import { FieldValidationException } from '../common/validation/field-validation.exception';
import { VoiceChannel } from './context/voice-context';
import { VoiceAppointmentSearchService } from './voice-appointment-search.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

describe('VoiceAppointmentSearchService', () => {
  const resolved = {
    token: 't'.repeat(43),
    context: {
      tenantId: 'tenant-a',
      channel: VoiceChannel.WEB_WIDGET,
      webVoiceChannelId: 'widget-a',
    },
    session: {},
  } as never;
  const appointment = (overrides: Record<string, unknown> = {}) => ({
    id: 'internal-appointment-id',
    appointmentNumber: 'APT-00123',
    startAt: new Date('2026-11-01T05:30:00.000Z'),
    endAt: new Date('2026-11-01T07:30:00.000Z'),
    status: AppointmentStatus.BOOKED,
    location: { name: 'Downtown', timezone: 'America/New_York' },
    provider: {
      firstName: 'Ali',
      lastName: 'Tahir',
      displayName: 'Dr. Ali Tahir',
      title: 'Dr.',
    },
    service: { name: 'Consultation' },
    ...overrides,
  });
  let prisma: {
    appointment: { findMany: jest.Mock };
    location: { findMany: jest.Mock };
  };
  let verification: { getVerifiedPatientForBooking: jest.Mock };
  let sessions: {
    resolve: jest.Mock;
    patientVerification: jest.Mock;
    setAppointmentSelection: jest.Mock;
  };
  let service: VoiceAppointmentSearchService;

  beforeEach(() => {
    prisma = {
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      location: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'location-a', timezone: 'America/New_York' },
          ]),
      },
    };
    verification = {
      getVerifiedPatientForBooking: jest
        .fn()
        .mockResolvedValue({ status: 'verified', patientId: 'patient-a' }),
    };
    sessions = {
      resolve: jest.fn().mockResolvedValue({}),
      patientVerification: jest
        .fn()
        .mockReturnValue({ identificationFlowVersion: 4 }),
      setAppointmentSelection: jest.fn().mockResolvedValue('updated'),
    };
    service = new VoiceAppointmentSearchService(
      prisma as never,
      verification as never,
      sessions as never,
    );
  });

  it('does not query or disclose appointments before verification', async () => {
    verification.getVerifiedPatientForBooking.mockResolvedValue({
      status: 'verification_required',
    });
    await expect(service.search(resolved, {})).resolves.toEqual({
      status: 'verification_required',
      message:
        'Patient verification is required before appointment information can be accessed.',
    });
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('scopes the query to trusted tenant, verified patient and eligible future statuses', async () => {
    await service.search(resolved, {}, new Date('2026-09-04T00:00:00Z'));
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          patientId: 'patient-a',
          status: {
            in: [AppointmentStatus.BOOKED, AppointmentStatus.CONFIRMED],
          },
          startAt: { gte: new Date('2026-09-04T00:00:00Z') },
        }),
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: 6,
      }),
    );
  });

  it('returns one privacy-safe local-time result and stores its private ID', async () => {
    prisma.appointment.findMany.mockResolvedValue([appointment()]);
    const result = await service.search(
      resolved,
      { startDate: '2026-11-01' },
      new Date('2026-09-01T00:00:00Z'),
    );
    expect(result).toEqual({
      status: 'ok',
      appointment: {
        appointmentReference: 'APT-00123',
        date: '2026-11-01',
        startTime: '01:30',
        endTime: '02:30',
        timezone: 'America/New_York',
        providerName: 'Dr. Ali Tahir',
        serviceName: 'Consultation',
        locationName: 'Downtown',
        status: 'BOOKED',
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /internal-appointment-id|patient-a|tenant-a|providerId|serviceId|locationId/,
    );
    expect(sessions.setAppointmentSelection).toHaveBeenCalledWith(
      't'.repeat(43),
      4,
      'patient-a',
      'internal-appointment-id',
    );
  });

  it('returns bounded chronological multiple matches and clears stale selection', async () => {
    prisma.appointment.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) =>
        appointment({
          id: `id-${index}`,
          appointmentNumber: `APT-${index}`,
          startAt: new Date(Date.UTC(2026, 8, 5 + index, 12)),
          endAt: new Date(Date.UTC(2026, 8, 5 + index, 13)),
          location: { name: 'UTC Clinic', timezone: 'UTC' },
        }),
      ),
    );
    const result = await service.search(
      resolved,
      {},
      new Date('2026-09-01T00:00:00Z'),
    );
    expect(result.status).toBe('multiple_matches');
    if (result.status !== 'multiple_matches') throw new Error('unexpected');
    expect(result.appointments).toHaveLength(5);
    expect(result.hasMore).toBe(true);
    expect(sessions.setAppointmentSelection).toHaveBeenCalledWith(
      expect.any(String),
      4,
      'patient-a',
      null,
    );
  });

  it('returns generic not_found and clears selection for foreign references', async () => {
    const result = await service.search(resolved, {
      appointmentReference: 'OTHER-PATIENT-REF',
    });
    expect(result).toEqual({
      status: 'not_found',
      message: 'No matching upcoming appointment was found.',
    });
    expect(sessions.setAppointmentSelection).toHaveBeenCalledWith(
      expect.any(String),
      4,
      'patient-a',
      null,
    );
  });

  it.each([
    [{ startDate: '2026-02-30' }, 'startDate'],
    [{ endDate: '2026-09-05' }, 'endDate'],
    [{ startDate: '2026-09-05', endDate: '2026-09-04' }, 'endDate'],
  ])('rejects invalid date input %p', async (dto, field) => {
    await expect(service.search(resolved, dto)).rejects.toBeInstanceOf(
      FieldValidationException,
    );
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    expect(field).toBeTruthy();
  });

  it('normalizes a spoken reference and ignores unrelated optional filters', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      appointment({ appointmentNumber: 'APT-01' }),
    ]);
    await service.search(resolved, {
      appointmentReference: ' apt 01 ',
      providerName: 'Ali Tahir',
      locationName: 'Uptown',
      endDate: '2027-09-05',
    });
    const where = prisma.appointment.findMany.mock.calls[0][0].where;
    expect(where.appointmentNumber).toEqual(
      expect.objectContaining({ equals: 'APT-01' }),
    );
    expect(where).not.toHaveProperty('location');
    expect(where).not.toHaveProperty('provider');
    expect(where).not.toHaveProperty('OR');
    expect(JSON.stringify(where)).not.toContain('selectedLocationId');
  });

  it.each(['APT-01', 'APT01', 'apt-01', 'APT 01', '  APT01  '])(
    'matches the generated reference from spoken variant %s',
    async (appointmentReference) => {
      prisma.appointment.findMany.mockResolvedValue([
        appointment({ appointmentNumber: 'APT-01' }),
      ]);
      await expect(
        service.search(resolved, { appointmentReference }),
      ).resolves.toMatchObject({ status: 'ok' });
    },
  );

  it('uses exact canonical comparison without fuzzy or leading-zero matching', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      appointment({ appointmentNumber: 'APT-06' }),
    ]);
    await expect(
      service.search(resolved, { appointmentReference: 'APT-6' }),
    ).resolves.toMatchObject({ status: 'not_found' });
  });
});
