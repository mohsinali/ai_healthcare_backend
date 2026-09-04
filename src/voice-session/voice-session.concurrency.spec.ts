import { createHash } from 'node:crypto';
import { createClient, RedisClientType } from 'redis';
import { VoiceChannel } from '../voice/context/voice-context';
import { VoiceSessionService } from './voice-session.service';

const runRedis = process.env.RUN_REDIS_TESTS === '1';
const describeRedis = runRedis ? describe : describe.skip;

describeRedis('VoiceSessionService Redis concurrency', () => {
  let client: RedisClientType;
  let service: VoiceSessionService;
  const keys = new Set<string>();
  const keyFor = (token: string) =>
    `voice:session:v1:${createHash('sha256').update(token).digest('hex')}`;

  beforeAll(async () => {
    client = createClient({
      socket: {
        host: process.env.TEST_REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.TEST_REDIS_PORT ?? 6379),
      },
      database: Number(process.env.TEST_REDIS_DB ?? 15),
    });
    await client.connect();
    service = new VoiceSessionService(
      {
        execute: (operation: (redis: RedisClientType) => Promise<unknown>) =>
          operation(client),
      } as never,
      { getOrThrow: () => 120 } as never,
    );
  });

  afterAll(async () => {
    if (!client) return;
    for (const key of keys) await client.del(key);
    await client.quit();
  });

  const create = async (channelIdentity = 'widget-a') => {
    const created = await service.create({
      tenantId: 'tenant-a',
      channel: VoiceChannel.WEB_WIDGET,
      channelIdentity,
      selectedLocationId: null,
    });
    keys.add(keyFor(created.token));
    return created;
  };

  it('atomically counts three concurrent failures and cannot bypass lockout', async () => {
    const { token } = await create();
    await service.replacePatientCandidates(token, ['patient-a']);
    const outcomes = await Promise.all([
      service.applyPatientVerification(token, 1, null),
      service.applyPatientVerification(token, 1, null),
      service.applyPatientVerification(token, 1, null),
    ]);
    expect(outcomes.sort()).toEqual(['locked', 'not_verified', 'not_verified']);
    const state = service.patientVerification(await service.resolve(token));
    expect(state).toMatchObject({ failedAttempts: 3, locked: true });
    await expect(
      service.applyPatientVerification(token, 1, 'patient-a'),
    ).resolves.toBe('locked');
    await expect(
      service.replacePatientCandidates(token, ['patient-b']),
    ).resolves.toBe('locked');
    expect(
      service.patientVerification(await service.resolve(token)),
    ).toMatchObject({
      failedAttempts: 3,
      locked: true,
      candidatePatientIds: ['patient-a'],
      identificationFlowVersion: 1,
    });
  });

  it('preserves attempts across corrected identification and clears candidates on success', async () => {
    const { token } = await create();
    await service.replacePatientCandidates(token, ['patient-a']);
    await expect(
      service.applyPatientVerification(token, 1, null),
    ).resolves.toBe('not_verified');
    await service.replacePatientCandidates(token, ['patient-b']);
    expect(
      service.patientVerification(await service.resolve(token)),
    ).toMatchObject({
      failedAttempts: 1,
      locked: false,
      candidatePatientIds: ['patient-b'],
      verifiedPatientId: null,
      identificationFlowVersion: 2,
    });
    await expect(
      service.applyPatientVerification(token, 2, 'patient-b'),
    ).resolves.toBe('verified');
    expect(await client.get(keyFor(token))).toContain(
      '"candidatePatientIds":[]',
    );
    expect(
      service.patientVerification(await service.resolve(token)),
    ).toMatchObject({
      failedAttempts: 1,
      candidatePatientIds: [],
      verifiedPatientId: 'patient-b',
    });
  });

  it('round-trips an empty identification candidate set as an array', async () => {
    const { token } = await create();
    await service.replacePatientCandidates(token, []);
    expect(
      service.patientVerification(await service.resolve(token)),
    ).toMatchObject({
      candidatePatientIds: [],
      identificationCompleted: true,
    });
  });

  it('rejects stale verification results after identification flow replacement', async () => {
    const { token } = await create();
    await service.replacePatientCandidates(token, ['patient-a']);
    await service.replacePatientCandidates(token, ['patient-b']);
    await expect(
      service.applyPatientVerification(token, 1, 'patient-a'),
    ).resolves.toBe('stale');
    expect(
      service.patientVerification(await service.resolve(token)),
    ).toMatchObject({
      failedAttempts: 0,
      candidatePatientIds: ['patient-b'],
      verifiedPatientId: null,
      identificationFlowVersion: 2,
    });
  });

  it('never extends absolute TTL and isolates browser-tab sessions', async () => {
    const first = await create('widget-a');
    const second = await create('widget-a');
    const firstKey = keyFor(first.token);
    const initialTtl = await client.pTTL(firstKey);
    await service.replacePatientCandidates(first.token, ['patient-a']);
    const afterIdentify = await client.pTTL(firstKey);
    await service.applyPatientVerification(first.token, 1, null);
    const afterVerify = await client.pTTL(firstKey);
    expect(afterIdentify).toBeLessThanOrEqual(initialTtl);
    expect(afterVerify).toBeLessThanOrEqual(afterIdentify);
    expect(
      service.patientVerification(await service.resolve(second.token)),
    ).toMatchObject({
      failedAttempts: 0,
      candidatePatientIds: [],
      identificationCompleted: false,
    });
  });

  it('atomically stores and clears verified-patient appointment selection without extending TTL', async () => {
    const { token } = await create();
    const key = keyFor(token);
    await service.replacePatientCandidates(token, ['patient-a']);
    await service.applyPatientVerification(token, 1, 'patient-a');
    const initialTtl = await client.pTTL(key);
    await expect(
      service.setAppointmentSelection(token, 1, 'patient-a', 'appointment-a'),
    ).resolves.toBe('updated');
    await expect(
      service.getSelectedAppointmentId({
        token,
        tenantId: 'tenant-a',
        channel: VoiceChannel.WEB_WIDGET,
        channelIdentity: 'widget-a',
      }),
    ).resolves.toBe('appointment-a');
    await expect(
      service.setAppointmentSelection(token, 1, 'patient-b', 'appointment-b'),
    ).resolves.toBe('stale');
    await service.setAppointmentSelection(token, 1, 'patient-a', null);
    await expect(
      service.getSelectedAppointmentId({
        token,
        tenantId: 'tenant-a',
        channel: VoiceChannel.WEB_WIDGET,
        channelIdentity: 'widget-a',
      }),
    ).resolves.toBeNull();
    expect(await client.pTTL(key)).toBeLessThanOrEqual(initialTtl);
  });

  it('clears a prior appointment selection when identification restarts', async () => {
    const { token } = await create();
    await service.replacePatientCandidates(token, ['patient-a']);
    await service.applyPatientVerification(token, 1, 'patient-a');
    await service.setAppointmentSelection(
      token,
      1,
      'patient-a',
      'appointment-a',
    );
    await service.replacePatientCandidates(token, ['patient-b']);
    expect((await service.resolve(token)).appointmentSelection).toBeUndefined();
  });

  it('binds reschedule confirmation to patient and selection versions without extending TTL', async () => {
    const { token } = await create();
    const key = keyFor(token);
    await service.replacePatientCandidates(token, ['patient-a']);
    await service.applyPatientVerification(token, 1, 'patient-a');
    await service.setAppointmentSelection(
      token,
      1,
      'patient-a',
      'appointment-a',
    );
    const initialTtl = await client.pTTL(key);
    await expect(
      service.setPendingReschedule({
        token,
        patientId: 'patient-a',
        appointmentId: 'appointment-a',
        appointmentDate: '2026-09-12',
        startTime: '14:30',
      }),
    ).resolves.toBe('updated');
    await expect(
      service.consumePendingReschedule({
        token,
        patientId: 'patient-a',
        appointmentId: 'appointment-a',
        appointmentDate: '2026-09-13',
        startTime: '14:30',
      }),
    ).resolves.toBe('missing');
    await expect(
      service.consumePendingReschedule({
        token,
        patientId: 'patient-a',
        appointmentId: 'appointment-a',
        appointmentDate: '2026-09-12',
        startTime: '14:30',
      }),
    ).resolves.toBe('consumed');
    expect((await service.resolve(token)).pendingReschedule).toBeUndefined();
    expect(await client.pTTL(key)).toBeLessThanOrEqual(initialTtl);
  });

  it('a new appointment selection clears an older reschedule proposal', async () => {
    const { token } = await create();
    await service.replacePatientCandidates(token, ['patient-a']);
    await service.applyPatientVerification(token, 1, 'patient-a');
    await service.setAppointmentSelection(
      token,
      1,
      'patient-a',
      'appointment-a',
    );
    await service.setPendingReschedule({
      token,
      patientId: 'patient-a',
      appointmentId: 'appointment-a',
      appointmentDate: '2026-09-12',
      startTime: '14:30',
    });
    await service.setAppointmentSelection(
      token,
      1,
      'patient-a',
      'appointment-b',
    );
    expect((await service.resolve(token)).pendingReschedule).toBeUndefined();
  });
});
