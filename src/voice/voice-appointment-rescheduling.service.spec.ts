import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { VoiceChannel } from './context/voice-context';
import { VoiceAppointmentReschedulingService } from './voice-appointment-rescheduling.service';

describe('VoiceAppointmentReschedulingService', () => {
  const resolved = {
    token: 't'.repeat(43),
    context: {
      tenantId: 'tenant-a',
      channel: VoiceChannel.WEB_WIDGET,
      webVoiceChannelId: 'widget-a',
    },
    session: {},
  } as never;
  const dto = {
    appointmentDate: '2026-09-12',
    startTime: '14:30',
    confirmed: false,
  };
  const valid = {
    status: 'valid',
    changed: true,
    current: {
      startAt: new Date('2026-09-08T05:30:00Z'),
      endAt: new Date('2026-09-08T06:00:00Z'),
    },
    appointment: {
      appointmentNumber: 'APT-00123',
      startAt: new Date('2026-09-12T09:30:00Z'),
      endAt: new Date('2026-09-12T10:00:00Z'),
      timezone: 'Asia/Karachi',
      providerName: 'Dr. Ali Tahir',
      serviceName: 'Consultation',
      locationName: 'Qureshi Medical Centre',
      status: AppointmentStatus.BOOKED,
    },
  } as const;
  let appointments: { rescheduleVerifiedPatient: jest.Mock };
  let verification: { getVerifiedPatientForBooking: jest.Mock };
  let sessions: {
    getSelectedAppointmentId: jest.Mock;
    setPendingReschedule: jest.Mock;
    consumePendingReschedule: jest.Mock;
    clearAppointmentSelection: jest.Mock;
  };
  let service: VoiceAppointmentReschedulingService;

  beforeEach(() => {
    appointments = {
      rescheduleVerifiedPatient: jest.fn().mockResolvedValue(valid),
    };
    verification = {
      getVerifiedPatientForBooking: jest
        .fn()
        .mockResolvedValue({ status: 'verified', patientId: 'patient-a' }),
    };
    sessions = {
      getSelectedAppointmentId: jest.fn().mockResolvedValue('appointment-a'),
      setPendingReschedule: jest.fn().mockResolvedValue('updated'),
      consumePendingReschedule: jest.fn().mockResolvedValue('consumed'),
      clearAppointmentSelection: jest.fn().mockResolvedValue(undefined),
    };
    service = new VoiceAppointmentReschedulingService(
      appointments as never,
      verification as never,
      sessions as never,
    );
  });

  it('reveals nothing and performs no lookup before verification', async () => {
    verification.getVerifiedPatientForBooking.mockResolvedValue({
      status: 'verification_required',
    });
    const result = await service.reschedule(resolved, dto);
    expect(result).toEqual({
      status: 'verification_required',
      message:
        'Patient verification is required before an appointment can be rescheduled.',
    });
    expect(sessions.getSelectedAppointmentId).not.toHaveBeenCalled();
    expect(appointments.rescheduleVerifiedPatient).not.toHaveBeenCalled();
  });

  it('requires a private selected appointment', async () => {
    sessions.getSelectedAppointmentId.mockResolvedValue(null);
    await expect(service.reschedule(resolved, dto)).resolves.toEqual({
      status: 'appointment_selection_required',
      message: 'An appointment must be selected before it can be rescheduled.',
    });
    expect(appointments.rescheduleVerifiedPatient).not.toHaveBeenCalled();
  });

  it('previews without mutation and stores the exact pending proposal', async () => {
    const result = await service.reschedule(resolved, dto);
    expect(appointments.rescheduleVerifiedPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        patientId: 'patient-a',
        appointmentId: 'appointment-a',
        mutate: false,
      }),
    );
    expect(sessions.setPendingReschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentDate: '2026-09-12',
        startTime: '14:30',
      }),
    );
    expect(result).toMatchObject({
      status: 'confirmation_required',
      currentAppointment: { date: '2026-09-08', startTime: '10:30' },
      proposedAppointment: { date: '2026-09-12', startTime: '14:30' },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /appointment-a|patient-a|tenant-a|patientId|providerId|locationId/,
    );
  });

  it('mutates only after atomically consuming the matching proposal', async () => {
    await expect(
      service.reschedule(resolved, { ...dto, confirmed: true }),
    ).resolves.toMatchObject({
      status: 'ok',
      appointment: { appointmentReference: 'APT-00123' },
    });
    expect(sessions.consumePendingReschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentDate: '2026-09-12',
        startTime: '14:30',
      }),
    );
    expect(appointments.rescheduleVerifiedPatient).toHaveBeenCalledWith(
      expect.objectContaining({ mutate: true }),
    );
  });

  it('requires a fresh preview when the proposal does not match', async () => {
    sessions.consumePendingReschedule.mockResolvedValue('missing');
    const result = await service.reschedule(resolved, {
      ...dto,
      confirmed: true,
    });
    expect(result.status).toBe('confirmation_required');
    expect(appointments.rescheduleVerifiedPatient).toHaveBeenCalledWith(
      expect.objectContaining({ mutate: false }),
    );
  });

  it('clears a stale or foreign selection and fails generically', async () => {
    appointments.rescheduleVerifiedPatient.mockResolvedValue({
      status: 'selection_invalid',
    });
    const result = await service.reschedule(resolved, dto);
    expect(result.status).toBe('appointment_selection_required');
    expect(sessions.clearAppointmentSelection).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('appointment-a');
  });

  it.each([
    [new ConflictException(), 'slot_unavailable'],
    [new BadRequestException(), 'invalid_appointment_time'],
  ])('maps scheduling failures to safe statuses', async (error, status) => {
    appointments.rescheduleVerifiedPatient.mockRejectedValue(error);
    await expect(service.reschedule(resolved, dto)).resolves.toMatchObject({
      status,
    });
  });
});
