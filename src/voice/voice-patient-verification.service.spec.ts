import { Logger } from '@nestjs/common';
import { PatientStatus } from '@prisma/client';
import { VoiceChannel } from './context/voice-context';
import { VoicePatientVerificationService } from './voice-patient-verification.service';
import { ResolvedVoiceToolSession } from './voice-tool-session.service';

const resolved: ResolvedVoiceToolSession = {
  token: 'token',
  context: {
    channel: VoiceChannel.WEB_WIDGET,
    tenantId: 'tenant-a',
    tenantName: 'Clinic',
    locationId: null,
    locationName: null,
    timezone: null,
    escalationPhoneNumber: null,
    webVoiceChannelId: 'channel-a',
    agentId: null,
    voiceSessionId: 'session-a',
  },
  session: {
    stateVersion: 1 as const,
    sessionId: 'session-a',
    tenantId: 'tenant-a',
    channel: VoiceChannel.WEB_WIDGET,
    channelIdentity: 'channel-a',
    selectedLocationId: null,
    createdAt: '2026-08-31T00:00:00.000Z',
    expiresAt: '2026-08-31T00:30:00.000Z',
  },
};

describe('VoicePatientVerificationService', () => {
  const prisma = { patient: { findMany: jest.fn(), findFirst: jest.fn() } };
  const sessions = {
    patientVerification: jest.fn(),
    replacePatientCandidates: jest.fn(),
    applyPatientVerification: jest.fn(),
    resolve: jest.fn(),
    assertMatches: jest.fn(),
  };
  const service = new VoicePatientVerificationService(
    prisma as never,
    sessions as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('stores only active same-tenant exact normalized identification IDs', async () => {
    sessions.patientVerification.mockReturnValue({ locked: false });
    prisma.patient.findMany.mockResolvedValue([{ id: 'patient-a' }]);
    sessions.replacePatientCandidates.mockResolvedValue('updated');

    await expect(
      service.identify(resolved, {
        firstName: ' Jane ',
        lastName: ' DOE ',
        dateOfBirth: '1985-04-17',
      }),
    ).resolves.toEqual({
      status: 'verification_required',
      message:
        'Please provide the phone number registered with the clinic to continue verification.',
    });
    expect(prisma.patient.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        status: PatientStatus.ACTIVE,
        normalizedFirstName: 'jane',
        normalizedLastName: 'doe',
        dateOfBirth: new Date('1985-04-17T00:00:00.000Z'),
      },
      select: { id: true },
    });
    expect(sessions.replacePatientCandidates).toHaveBeenCalledWith('token', [
      'patient-a',
    ]);
  });

  it.each([['1985-02-30'], ['2999-01-01']])(
    'rejects invalid or future date-only birth date %s without querying',
    async (dateOfBirth) => {
      sessions.patientVerification.mockReturnValue({ locked: false });
      await expect(
        service.identify(resolved, {
          firstName: 'Jane',
          lastName: 'Doe',
          dateOfBirth,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(prisma.patient.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    { candidates: [] },
    { candidates: [{ id: 'patient-a' }, { id: 'patient-b' }] },
  ])(
    'returns the identical identification response for zero or multiple candidates',
    async ({ candidates }) => {
      sessions.patientVerification.mockReturnValue({ locked: false });
      prisma.patient.findMany.mockResolvedValue(candidates);
      sessions.replacePatientCandidates.mockResolvedValue('updated');
      await expect(
        service.identify(resolved, {
          firstName: 'Jane',
          lastName: 'Doe',
          dateOfBirth: '1985-04-17',
        }),
      ).resolves.toEqual({
        status: 'verification_required',
        message:
          'Please provide the phone number registered with the clinic to continue verification.',
      });
    },
  );

  it('does not query patients when verification is called before identification', async () => {
    sessions.patientVerification.mockReturnValue({
      locked: false,
      identificationCompleted: false,
    });
    await expect(service.verify(resolved, 'not-even-a-phone')).resolves.toEqual(
      {
        status: 'identification_required',
        message: 'Patient identification is required before verification.',
      },
    );
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });

  it('verifies only one exact active same-tenant candidate', async () => {
    sessions.patientVerification.mockReturnValue({
      locked: false,
      identificationCompleted: true,
      candidatePatientIds: ['patient-a', 'patient-b'],
      identificationFlowVersion: 4,
    });
    prisma.patient.findMany.mockResolvedValue([{ id: 'patient-a' }]);
    sessions.applyPatientVerification.mockResolvedValue('verified');
    await expect(service.verify(resolved, '+1 416 555 0123')).resolves.toEqual({
      status: 'verified',
      message: 'Patient verification was successful.',
    });
    expect(prisma.patient.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['patient-a', 'patient-b'] },
        tenantId: 'tenant-a',
        status: PatientStatus.ACTIVE,
        phone: '+14165550123',
      },
      select: { id: true },
      take: 2,
    });
    expect(sessions.applyPatientVerification).toHaveBeenCalledWith(
      'token',
      4,
      'patient-a',
    );
  });

  it('never selects among multiple matching candidates', async () => {
    sessions.patientVerification.mockReturnValue({
      locked: false,
      identificationCompleted: true,
      candidatePatientIds: ['patient-a', 'patient-b'],
      identificationFlowVersion: 1,
    });
    prisma.patient.findMany.mockResolvedValue([
      { id: 'patient-a' },
      { id: 'patient-b' },
    ]);
    sessions.applyPatientVerification.mockResolvedValue('not_verified');
    await expect(
      service.verify(resolved, '+1 416 555 0123'),
    ).resolves.toMatchObject({
      status: 'not_verified',
    });
    expect(sessions.applyPatientVerification).toHaveBeenCalledWith(
      'token',
      1,
      null,
    );
  });

  it('returns lockout without querying Patient when the session is locked', async () => {
    sessions.patientVerification.mockReturnValue({ locked: true });
    await expect(
      service.identify(resolved, {
        firstName: 'Jane',
        lastName: 'Doe',
        dateOfBirth: '1985-04-17',
      }),
    ).resolves.toMatchObject({ status: 'manual_verification_required' });
    await expect(
      service.verify(resolved, '+1 416 555 0123'),
    ).resolves.toMatchObject({ status: 'manual_verification_required' });
    expect(prisma.patient.findMany).not.toHaveBeenCalled();
  });

  it('retries verification against a corrected identification flow', async () => {
    sessions.patientVerification
      .mockReturnValueOnce({
        locked: false,
        identificationCompleted: true,
        candidatePatientIds: ['old-patient'],
        identificationFlowVersion: 1,
      })
      .mockReturnValueOnce({
        locked: false,
        identificationCompleted: true,
        candidatePatientIds: ['corrected-patient'],
        identificationFlowVersion: 2,
      });
    sessions.resolve.mockResolvedValue({});
    prisma.patient.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'corrected-patient' }]);
    sessions.applyPatientVerification
      .mockResolvedValueOnce('stale')
      .mockResolvedValueOnce('verified');

    await expect(
      service.verify(resolved, '+1 416 555 0123'),
    ).resolves.toMatchObject({ status: 'verified' });
    expect(sessions.applyPatientVerification).toHaveBeenNthCalledWith(
      1,
      'token',
      1,
      null,
    );
    expect(sessions.applyPatientVerification).toHaveBeenNthCalledWith(
      2,
      'token',
      2,
      'corrected-patient',
    );
  });

  it('returns only generic response fields and performs no Patient or Appointment mutation', async () => {
    sessions.patientVerification.mockReturnValue({
      locked: false,
      identificationCompleted: true,
      candidatePatientIds: [],
      identificationFlowVersion: 1,
    });
    prisma.patient.findMany.mockResolvedValue([]);
    sessions.applyPatientVerification.mockResolvedValue('not_verified');
    const response = await service.verify(resolved, '+1 416 555 0123');
    expect(Object.keys(response).sort()).toEqual(['message', 'status']);
    expect(JSON.stringify(response)).not.toMatch(
      /patient-a|candidate|count|Jane|Doe|1985|416555/i,
    );
    expect(Object.keys(prisma.patient)).toEqual(['findMany', 'findFirst']);
    expect(prisma).not.toHaveProperty('appointment');
  });

  it('emits no patient inputs, candidates or counts through application logs', async () => {
    const log = jest.spyOn(Logger.prototype, 'log');
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const error = jest.spyOn(Logger.prototype, 'error');
    sessions.patientVerification.mockReturnValue({ locked: false });
    prisma.patient.findMany.mockResolvedValue([{ id: 'patient-a' }]);
    sessions.replacePatientCandidates.mockResolvedValue('updated');
    await service.identify(resolved, {
      firstName: 'SensitiveFirst',
      lastName: 'SensitiveLast',
      dateOfBirth: '1985-04-17',
    });
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });

  it('resolves a verified patient only after session, widget, tenant and active-status revalidation', async () => {
    sessions.resolve.mockResolvedValue({});
    sessions.patientVerification.mockReturnValue({
      locked: false,
      verifiedPatientId: 'patient-a',
    });
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a' });
    await expect(service.getVerifiedPatientId(resolved)).resolves.toBe(
      'patient-a',
    );
    expect(sessions.assertMatches).toHaveBeenCalledWith(
      {},
      'tenant-a',
      VoiceChannel.WEB_WIDGET,
      'channel-a',
    );
    expect(prisma.patient.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'patient-a',
        tenantId: 'tenant-a',
        status: PatientStatus.ACTIVE,
      },
      select: { id: true },
    });
  });

  it.each([
    [{ locked: true, verifiedPatientId: 'patient-a' }, { id: 'patient-a' }],
    [{ locked: false, verifiedPatientId: null }, { id: 'patient-a' }],
    [{ locked: false, verifiedPatientId: 'patient-a' }, null],
  ])(
    'rejects missing, locked, inactive or cross-tenant verified patients',
    async (state, patient) => {
      sessions.resolve.mockResolvedValue({});
      sessions.patientVerification.mockReturnValue(state);
      prisma.patient.findFirst.mockResolvedValue(patient);
      await expect(
        service.getVerifiedPatientId(resolved),
      ).rejects.toMatchObject({
        status: 401,
      });
    },
  );
});
