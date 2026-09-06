import { AppointmentStatus } from '@prisma/client';
import { VoiceAppointmentCancellationService } from './voice-appointment-cancellation.service';
import { VoiceChannel } from './context/voice-context';

describe('VoiceAppointmentCancellationService', () => {
  const resolved = {
    token: 't'.repeat(43),
    context: {
      tenantId: 'tenant-a',
      channel: VoiceChannel.WEB_WIDGET,
      webVoiceChannelId: 'widget-a',
    },
  } as never;
  const valid = {
    status: 'valid',
    changed: false,
    appointment: {
      appointmentNumber: 'APT-00123',
      startAt: new Date('2026-09-12T09:30:00Z'),
      endAt: new Date('2026-09-12T10:00:00Z'),
      updatedAt: new Date('2026-09-01T10:00:00Z'),
      timezone: 'Asia/Karachi',
      providerName: 'Dr. Ali Tahir',
      serviceName: 'Consultation',
      locationName: 'Qureshi Medical Centre',
      status: AppointmentStatus.BOOKED,
    },
  } as const;
  let appointments: { cancelVerifiedPatient: jest.Mock };
  let verification: { getVerifiedPatientForBooking: jest.Mock };
  let sessions: {
    getSelectedAppointmentId: jest.Mock;
    setPendingCancellation: jest.Mock;
    consumePendingCancellation: jest.Mock;
    clearAppointmentSelection: jest.Mock;
  };
  let service: VoiceAppointmentCancellationService;

  beforeEach(() => {
    appointments = {
      cancelVerifiedPatient: jest.fn().mockResolvedValue(valid),
    };
    verification = {
      getVerifiedPatientForBooking: jest
        .fn()
        .mockResolvedValue({ status: 'verified', patientId: 'patient-a' }),
    };
    sessions = {
      getSelectedAppointmentId: jest.fn().mockResolvedValue('appointment-a'),
      setPendingCancellation: jest.fn().mockResolvedValue('updated'),
      consumePendingCancellation: jest.fn().mockResolvedValue({
        status: 'consumed',
        appointmentUpdatedAt: '2026-09-01T10:00:00.000Z',
      }),
      clearAppointmentSelection: jest.fn().mockResolvedValue(undefined),
    };
    service = new VoiceAppointmentCancellationService(
      appointments as never,
      verification as never,
      sessions as never,
    );
  });

  it('reveals nothing before verification', async () => {
    verification.getVerifiedPatientForBooking.mockResolvedValue({
      status: 'verification_required',
    });
    const result = await service.cancel(resolved, { confirmed: false });
    expect(result).toEqual({
      status: 'verification_required',
      message:
        'Patient verification is required before an appointment can be cancelled.',
    });
    expect(sessions.getSelectedAppointmentId).not.toHaveBeenCalled();
    expect(appointments.cancelVerifiedPatient).not.toHaveBeenCalled();
  });

  it('requires a private appointment selection', async () => {
    sessions.getSelectedAppointmentId.mockResolvedValue(null);
    await expect(
      service.cancel(resolved, { confirmed: false }),
    ).resolves.toEqual({
      status: 'appointment_selection_required',
      message: 'An appointment must be selected before it can be cancelled.',
    });
  });

  it('previews without mutation and binds the database version marker', async () => {
    const result = await service.cancel(resolved, { confirmed: false });
    expect(appointments.cancelVerifiedPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        patientId: 'patient-a',
        appointmentId: 'appointment-a',
        mutate: false,
      }),
    );
    expect(sessions.setPendingCancellation).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentUpdatedAt: '2026-09-01T10:00:00.000Z',
      }),
    );
    expect(result).toMatchObject({
      status: 'confirmation_required',
      appointment: { date: '2026-09-12', startTime: '14:30' },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /appointment-a|patient-a|tenant-a|patientId|providerId|locationId/,
    );
  });

  it('never lets a direct confirmed call bypass preview', async () => {
    sessions.consumePendingCancellation.mockResolvedValue({
      status: 'missing',
    });
    const result = await service.cancel(resolved, { confirmed: true });
    expect(result.status).toBe('confirmation_required');
    expect(appointments.cancelVerifiedPatient).toHaveBeenCalledWith(
      expect.objectContaining({ mutate: false }),
    );
  });

  it('cancels only after consuming the bound preview and clears private state', async () => {
    appointments.cancelVerifiedPatient.mockResolvedValue({
      ...valid,
      changed: true,
      appointment: {
        ...valid.appointment,
        status: AppointmentStatus.CANCELLED,
      },
    });
    const result = await service.cancel(resolved, { confirmed: true });
    expect(appointments.cancelVerifiedPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        mutate: true,
        expectedUpdatedAt: '2026-09-01T10:00:00.000Z',
      }),
    );
    expect(result).toMatchObject({
      status: 'ok',
      appointment: { status: 'CANCELLED' },
    });
    expect(sessions.clearAppointmentSelection).toHaveBeenCalled();
  });

  it.each([
    ['selection_invalid', 'appointment_selection_required'],
    ['appointment_not_cancellable', 'appointment_not_cancellable'],
  ])('maps %s to a privacy-safe result', async (domainStatus, status) => {
    appointments.cancelVerifiedPatient.mockResolvedValue({
      status: domainStatus,
    });
    await expect(
      service.cancel(resolved, { confirmed: false }),
    ).resolves.toMatchObject({ status });
  });
});
