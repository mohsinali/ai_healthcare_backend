import { BadRequestException, ConflictException } from '@nestjs/common';
import { VoiceAppointmentBookingService } from './voice-appointment-booking.service';

describe('VoiceAppointmentBookingService', () => {
  const dto = {
    serviceName: 'General Consultation',
    providerName: 'Dr. Sarah Ahmed',
    appointmentDate: '2026-09-10',
    startTime: '10:30',
    confirmed: true,
  };
  const resolved = {
    context: { tenantId: 'tenant-a' },
    session: { selectedLocationId: 'location-a' },
  } as never;

  function setup() {
    const prisma = {
      location: {
        findFirst: jest.fn().mockResolvedValue({ id: 'location-a' }),
      },
      service: { findFirst: jest.fn().mockResolvedValue({ id: 'service-a' }) },
      provider: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'provider-a',
          providerServices: [{ id: 'qualification-a' }],
        }),
      },
    };
    const appointments = {
      bookVerifiedPatient: jest.fn().mockResolvedValue({
        appointmentNumber: 'APT-00123',
        locationName: 'Qureshi Medical Centre',
        serviceName: dto.serviceName,
        providerName: dto.providerName,
        timezone: 'America/Toronto',
      }),
    };
    const verification = {
      getVerifiedPatientForBooking: jest
        .fn()
        .mockResolvedValue({ status: 'verified', patientId: 'patient-a' }),
    };
    return {
      prisma,
      appointments,
      verification,
      service: new VoiceAppointmentBookingService(
        prisma as never,
        appointments as never,
        verification as never,
      ),
    };
  }

  it('does no patient lookup or write without exact confirmation', async () => {
    const { service, verification, appointments } = setup();
    await expect(
      service.book(resolved, { ...dto, confirmed: false }),
    ).resolves.toMatchObject({
      status: 'confirmation_required',
    });
    expect(verification.getVerifiedPatientForBooking).not.toHaveBeenCalled();
    expect(appointments.bookVerifiedPatient).not.toHaveBeenCalled();
  });

  it.each(['verification_required', 'manual_verification_required'] as const)(
    'fails safely when verification reports %s',
    async (status) => {
      const { service, verification, appointments } = setup();
      verification.getVerifiedPatientForBooking.mockResolvedValue({ status });
      await expect(service.book(resolved, dto)).resolves.toMatchObject({
        status,
      });
      expect(appointments.bookVerifiedPatient).not.toHaveBeenCalled();
    },
  );

  it('books using trusted IDs and returns no internal IDs', async () => {
    const { service, appointments } = setup();
    const result = await service.book(resolved, dto);
    expect(appointments.bookVerifiedPatient).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      patientId: 'patient-a',
      locationId: 'location-a',
      serviceId: 'service-a',
      providerId: 'provider-a',
      appointmentDate: '2026-09-10',
      startTime: '10:30',
    });
    expect(result).toMatchObject({
      status: 'booked',
      appointment: { confirmationCode: 'APT-00123' },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /tenant-a|patient-a|location-a|service-a|provider-a/,
    );
  });

  it.each([
    [new ConflictException(), 'slot_unavailable'],
    [new BadRequestException(), 'invalid_appointment_time'],
    [new Error('database unavailable'), 'booking_failed'],
  ])('maps domain failures to safe statuses', async (error, status) => {
    const { service, appointments } = setup();
    appointments.bookVerifiedPatient.mockRejectedValue(error);
    await expect(service.book(resolved, dto)).resolves.toMatchObject({
      status,
    });
  });
});
