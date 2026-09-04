import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { VoiceChannel } from '../voice/context/voice-context';
import {
  PatientVerificationState,
  VOICE_SESSION_TOKEN_PATTERN,
  VoiceSessionRecord,
} from './voice-session.types';

const KEY_PREFIX = 'voice:session:v1:';
const INVALID_SESSION = 'Voice session is invalid or expired.';
const DEFAULT_PATIENT_VERIFICATION: PatientVerificationState = {
  candidatePatientIds: [],
  verifiedPatientId: null,
  failedAttempts: 0,
  locked: false,
  identificationCompleted: false,
  identificationFlowVersion: 0,
};

@Injectable()
export class VoiceSessionService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.ttlSeconds = config.getOrThrow<number>('VOICE_SESSION_TTL_SECONDS');
  }

  async create(input: {
    tenantId: string;
    channel: VoiceChannel;
    channelIdentity: string;
    selectedLocationId: string | null;
  }): Promise<{ token: string; session: VoiceSessionRecord }> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const session: VoiceSessionRecord = {
      stateVersion: 1,
      sessionId: randomUUID(),
      ...input,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + this.ttlSeconds * 1_000,
      ).toISOString(),
    };
    await this.redis.execute(async (client) => {
      const result = await client.set(
        this.key(token),
        JSON.stringify(session),
        {
          EX: this.ttlSeconds,
          NX: true,
        },
      );
      if (result !== 'OK')
        throw new ServiceUnavailableException(
          'Transient session service is unavailable.',
        );
    });
    return { token, session };
  }

  async resolve(token: string | undefined): Promise<VoiceSessionRecord> {
    if (!token || !VOICE_SESSION_TOKEN_PATTERN.test(token)) this.invalid();
    const value = await this.redis.execute((client) =>
      client.get(this.key(token)),
    );
    if (!value) this.invalid();
    const session = this.parse(value);
    if (Date.parse(session.expiresAt) <= Date.now()) this.invalid();
    return session;
  }

  async bindSelectedLocation(
    token: string,
    expected: VoiceSessionRecord,
    locationId: string,
  ): Promise<VoiceSessionRecord> {
    const updated = { ...expected, selectedLocationId: locationId };
    const expiresAtMs = Date.parse(expected.expiresAt);
    if (expiresAtMs <= Date.now()) this.invalid();
    const result = await this.redis.execute((client) =>
      client.eval(
        `local current = redis.call('GET', KEYS[1])
         if not current or current ~= ARGV[1] then return 0 end
         redis.call('SET', KEYS[1], ARGV[2])
         redis.call('PEXPIREAT', KEYS[1], ARGV[3])
         return 1`,
        {
          keys: [this.key(token)],
          arguments: [
            JSON.stringify(expected),
            JSON.stringify(updated),
            String(expiresAtMs),
          ],
        },
      ),
    );
    if (result !== 1) this.invalid();
    return updated;
  }

  patientVerification(session: VoiceSessionRecord): PatientVerificationState {
    return session.patientVerification ?? { ...DEFAULT_PATIENT_VERIFICATION };
  }

  async replacePatientCandidates(
    token: string,
    candidatePatientIds: string[],
  ): Promise<'updated' | 'locked'> {
    const result = await this.redis.execute((client) =>
      client.eval(
        `local raw = redis.call('GET', KEYS[1])
         if not raw then return -1 end
         local state = cjson.decode(raw)
         local patient = state.patientVerification or {candidatePatientIds={}, verifiedPatientId=cjson.null, failedAttempts=0, locked=false, identificationCompleted=false, identificationFlowVersion=0}
         if patient.locked then return 0 end
         patient.candidatePatientIds = cjson.decode(ARGV[1])
         patient.verifiedPatientId = cjson.null
         patient.identificationCompleted = true
         patient.identificationFlowVersion = patient.identificationFlowVersion + 1
         state.patientVerification = patient
         state.appointmentSelection = nil
         local encoded = cjson.encode(state)
         encoded = string.gsub(encoded, '"candidatePatientIds":{}', '"candidatePatientIds":[]', 1)
         redis.call('SET', KEYS[1], encoded, 'KEEPTTL')
         return 1`,
        {
          keys: [this.key(token)],
          arguments: [JSON.stringify(candidatePatientIds)],
        },
      ),
    );
    if (result === -1) this.invalid();
    return result === 0 ? 'locked' : 'updated';
  }

  async applyPatientVerification(
    token: string,
    expectedFlowVersion: number,
    verifiedPatientId: string | null,
  ): Promise<'verified' | 'not_verified' | 'locked' | 'stale'> {
    const result = await this.redis.execute((client) =>
      client.eval(
        `local raw = redis.call('GET', KEYS[1])
         if not raw then return -1 end
         local state = cjson.decode(raw)
         local patient = state.patientVerification
         if not patient or not patient.identificationCompleted then return -2 end
         if patient.locked then return 0 end
         if patient.verifiedPatientId and patient.verifiedPatientId ~= cjson.null then return 2 end
         if patient.identificationFlowVersion ~= tonumber(ARGV[1]) then return 3 end
         if ARGV[2] ~= '' then
           patient.candidatePatientIds = cjson.decode('[]')
           patient.verifiedPatientId = ARGV[2]
           state.patientVerification = patient
           local encoded = cjson.encode(state)
           encoded = string.gsub(encoded, '"candidatePatientIds":{}', '"candidatePatientIds":[]', 1)
           redis.call('SET', KEYS[1], encoded, 'KEEPTTL')
           return 2
         end
         patient.failedAttempts = patient.failedAttempts + 1
         if patient.failedAttempts >= 3 then patient.locked = true end
         state.patientVerification = patient
         local encoded = cjson.encode(state)
         encoded = string.gsub(encoded, '"candidatePatientIds":{}', '"candidatePatientIds":[]', 1)
         redis.call('SET', KEYS[1], encoded, 'KEEPTTL')
         if patient.locked then return 0 else return 1 end`,
        {
          keys: [this.key(token)],
          arguments: [String(expectedFlowVersion), verifiedPatientId ?? ''],
        },
      ),
    );
    if (result === -1) this.invalid();
    if (result === -2 || result === 3) return 'stale';
    if (result === 0) return 'locked';
    if (result === 2) return 'verified';
    return 'not_verified';
  }

  async setAppointmentSelection(
    token: string,
    expectedFlowVersion: number,
    verifiedPatientId: string,
    appointmentId: string | null,
  ): Promise<'updated' | 'stale'> {
    const result = await this.redis.execute((client) =>
      client.eval(
        `local raw = redis.call('GET', KEYS[1])
         if not raw then return -1 end
         local state = cjson.decode(raw)
         local patient = state.patientVerification
         if not patient or patient.locked or patient.verifiedPatientId ~= ARGV[2] or patient.identificationFlowVersion ~= tonumber(ARGV[1]) then return 0 end
         local prior = state.appointmentSelection
         local version = prior and prior ~= cjson.null and prior.selectionVersion or 0
         state.appointmentSelection = {selectedAppointmentId=ARGV[3] ~= '' and ARGV[3] or cjson.null, patientVerificationFlowVersion=tonumber(ARGV[1]), selectionVersion=version + 1}
         redis.call('SET', KEYS[1], cjson.encode(state), 'KEEPTTL')
         return 1`,
        {
          keys: [this.key(token)],
          arguments: [
            String(expectedFlowVersion),
            verifiedPatientId,
            appointmentId ?? '',
          ],
        },
      ),
    );
    if (result === -1) this.invalid();
    return result === 1 ? 'updated' : 'stale';
  }

  async getSelectedAppointmentId(input: {
    token: string;
    tenantId: string;
    channel: VoiceChannel;
    channelIdentity: string;
  }): Promise<string | null> {
    const session = await this.resolve(input.token);
    this.assertMatches(
      session,
      input.tenantId,
      input.channel,
      input.channelIdentity,
    );
    const patient = this.patientVerification(session);
    const selection = session.appointmentSelection;
    if (
      patient.locked ||
      !patient.verifiedPatientId ||
      !selection ||
      selection.patientVerificationFlowVersion !==
        patient.identificationFlowVersion
    )
      return null;
    return selection.selectedAppointmentId;
  }

  private key(token: string): string {
    return `${KEY_PREFIX}${createHash('sha256').update(token).digest('hex')}`;
  }

  private parse(value: string): VoiceSessionRecord {
    try {
      const item = JSON.parse(value) as Partial<VoiceSessionRecord>;
      if (
        item.stateVersion !== 1 ||
        typeof item.sessionId !== 'string' ||
        typeof item.tenantId !== 'string' ||
        !Object.values(VoiceChannel).includes(item.channel as VoiceChannel) ||
        typeof item.channelIdentity !== 'string' ||
        !(
          typeof item.selectedLocationId === 'string' ||
          item.selectedLocationId === null
        ) ||
        typeof item.createdAt !== 'string' ||
        typeof item.expiresAt !== 'string'
      )
        this.invalid();
      if (item.patientVerification !== undefined) {
        const p = item.patientVerification;
        if (
          !Array.isArray(p.candidatePatientIds) ||
          !p.candidatePatientIds.every((id) => typeof id === 'string') ||
          !(
            typeof p.verifiedPatientId === 'string' ||
            p.verifiedPatientId === null
          ) ||
          !Number.isInteger(p.failedAttempts) ||
          p.failedAttempts < 0 ||
          typeof p.locked !== 'boolean' ||
          typeof p.identificationCompleted !== 'boolean' ||
          !Number.isInteger(p.identificationFlowVersion) ||
          p.identificationFlowVersion < 0
        )
          this.invalid();
      }
      if (item.appointmentSelection !== undefined) {
        const selection = item.appointmentSelection;
        if (
          !selection ||
          !(
            typeof selection.selectedAppointmentId === 'string' ||
            selection.selectedAppointmentId === null
          ) ||
          !Number.isInteger(selection.patientVerificationFlowVersion) ||
          selection.patientVerificationFlowVersion < 0 ||
          !Number.isInteger(selection.selectionVersion) ||
          selection.selectionVersion < 1
        )
          this.invalid();
      }
      return item as VoiceSessionRecord;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.invalid();
    }
  }

  assertMatches(
    session: VoiceSessionRecord,
    tenantId: string,
    channel: VoiceChannel,
    channelIdentity: string,
  ): void {
    const sameIdentity =
      Buffer.byteLength(session.channelIdentity) ===
        Buffer.byteLength(channelIdentity) &&
      timingSafeEqual(
        Buffer.from(session.channelIdentity),
        Buffer.from(channelIdentity),
      );
    if (
      session.tenantId !== tenantId ||
      session.channel !== channel ||
      !sameIdentity
    )
      this.invalid();
  }

  private invalid(): never {
    throw new UnauthorizedException(INVALID_SESSION);
  }
}
