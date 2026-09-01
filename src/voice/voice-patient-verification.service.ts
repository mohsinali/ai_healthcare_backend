import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PatientStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  normalizePatientName,
  normalizePatientPhone,
  parsePatientDateOfBirth,
} from '../patients/patient-normalization';
import { patientNameSimilarity } from '../patients/patient-name-similarity';
import { VoiceSessionService } from '../voice-session/voice-session.service';
import { VoiceIdentifyPatientDto } from './dto/voice-patient-verification.dto';
import { ResolvedVoiceToolSession } from './voice-tool-session.service';

export type PatientVerificationResponse = {
  status:
    | 'verification_required'
    | 'identification_required'
    | 'not_verified'
    | 'verified'
    | 'manual_verification_required';
  message: string;
};

const MANUAL: PatientVerificationResponse = {
  status: 'manual_verification_required',
  message:
    'Automated patient verification cannot continue for this conversation.',
};

const NAME_SIMILARITY_THRESHOLD = 0.85;
// Overflow fails closed by storing no candidates; candidates are never truncated.
const MAX_PATIENT_CANDIDATES = 25;

@Injectable()
export class VoicePatientVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: VoiceSessionService,
  ) {}

  async identify(
    resolved: ResolvedVoiceToolSession,
    dto: VoiceIdentifyPatientDto,
  ): Promise<PatientVerificationResponse> {
    if (this.sessions.patientVerification(resolved.session).locked)
      return MANUAL;
    const submittedFirstName = normalizePatientName(dto.firstName);
    const submittedLastName = normalizePatientName(dto.lastName);
    const eligiblePatients = await this.prisma.patient.findMany({
      where: {
        tenantId: resolved.context.tenantId,
        status: PatientStatus.ACTIVE,
        dateOfBirth: parsePatientDateOfBirth(dto.dateOfBirth),
      },
      select: { id: true, firstName: true, lastName: true },
    });
    const normalizedPatients = eligiblePatients.map((patient) => ({
      id: patient.id,
      firstName: normalizePatientName(patient.firstName),
      lastName: normalizePatientName(patient.lastName),
    }));
    const exactCandidates = normalizedPatients.filter(
      (patient) =>
        patient.firstName === submittedFirstName &&
        patient.lastName === submittedLastName,
    );
    const candidates =
      exactCandidates.length > 0
        ? exactCandidates
        : normalizedPatients.filter(
            (patient) =>
              patientNameSimilarity(submittedFirstName, patient.firstName) >=
                NAME_SIMILARITY_THRESHOLD &&
              patientNameSimilarity(submittedLastName, patient.lastName) >=
                NAME_SIMILARITY_THRESHOLD,
          );
    const candidateIds =
      candidates.length <= MAX_PATIENT_CANDIDATES
        ? candidates.map(({ id }) => id)
        : [];
    const outcome = await this.sessions.replacePatientCandidates(
      resolved.token,
      candidateIds,
    );
    if (outcome === 'locked') return MANUAL;
    return {
      status: 'verification_required',
      message:
        'Please provide the phone number registered with the clinic to continue verification.',
    };
  }

  async verify(
    resolved: ResolvedVoiceToolSession,
    phoneNumber: string,
  ): Promise<PatientVerificationResponse> {
    for (let retry = 0; retry < 3; retry += 1) {
      const session =
        retry === 0
          ? resolved.session
          : await this.sessions.resolve(resolved.token);
      const state = this.sessions.patientVerification(session);
      if (state.locked) return MANUAL;
      if (state.verifiedPatientId)
        return {
          status: 'verified',
          message: 'Patient verification was successful.',
        };
      if (!state.identificationCompleted)
        return {
          status: 'identification_required',
          message: 'Patient identification is required before verification.',
        };
      const normalizedPhone = normalizePatientPhone(phoneNumber);
      const matches = await this.prisma.patient.findMany({
        where: {
          id: { in: state.candidatePatientIds },
          tenantId: resolved.context.tenantId,
          status: PatientStatus.ACTIVE,
          phone: normalizedPhone,
        },
        select: { id: true },
        take: 2,
      });
      const outcome = await this.sessions.applyPatientVerification(
        resolved.token,
        state.identificationFlowVersion,
        matches.length === 1 ? matches[0].id : null,
      );
      if (outcome === 'stale') continue;
      if (outcome === 'locked') return MANUAL;
      if (outcome === 'verified')
        return {
          status: 'verified',
          message: 'Patient verification was successful.',
        };
      return {
        status: 'not_verified',
        message: 'The patient could not be verified. Please try again.',
      };
    }
    return {
      status: 'not_verified',
      message: 'The patient could not be verified. Please try again.',
    };
  }

  async getVerifiedPatientId(
    resolved: ResolvedVoiceToolSession,
  ): Promise<string> {
    const session = await this.sessions.resolve(resolved.token);
    this.sessions.assertMatches(
      session,
      resolved.context.tenantId,
      resolved.context.channel,
      resolved.context.webVoiceChannelId,
    );
    const state = this.sessions.patientVerification(session);
    if (state.locked || !state.verifiedPatientId)
      throw new UnauthorizedException('Patient verification is required.');
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: state.verifiedPatientId,
        tenantId: resolved.context.tenantId,
        status: PatientStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!patient)
      throw new UnauthorizedException('Patient verification is required.');
    return patient.id;
  }
}
