import { VoiceChannel, VoiceContext } from './context/voice-context';
import { VoiceFaqService } from './voice-faq.service';

describe('VoiceFaqService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const locationId = '22222222-2222-4222-8222-222222222222';
  const context = (resolved = true): VoiceContext => ({
    channel: VoiceChannel.WEB_WIDGET,
    tenantId,
    tenantName: 'Clinic A',
    locationId: resolved ? locationId : null,
    locationName: resolved ? 'Location 1' : null,
    timezone: 'Asia/Karachi',
    escalationPhoneNumber: null,
    webVoiceChannelId: 'channel-id',
    agentId: null,
  });
  const updatedAt = new Date('2026-08-28T00:00:00.000Z');

  it('passes only trusted context scope and returns ranked separate matches', async () => {
    const searchApprovedFAQCandidates = jest.fn().mockResolvedValue([
      {
        question: 'Is parking available?',
        answer: 'Free parking is behind the clinic.',
        keywords: ['parking'],
        locationId,
        updatedAt,
      },
      {
        question: 'What are your opening hours?',
        answer: 'We open at 9 AM.',
        keywords: ['hours'],
        locationId: null,
        updatedAt,
      },
    ]);
    const service = new VoiceFaqService({
      searchApprovedFAQCandidates,
      hasApprovedLocationSpecificMatch: jest.fn(),
    } as never);

    const result = await service.search(context(), 'Do you have parking?');

    expect(searchApprovedFAQCandidates).toHaveBeenCalledWith({
      tenantId,
      locationId,
      terms: ['parking'],
    });
    expect(result).toEqual({
      found: true,
      matches: [
        {
          question: 'Is parking available?',
          answer: 'Free parking is behind the clinic.',
          scope: 'LOCATION',
        },
      ],
    });
  });

  it('returns at most three deterministically ranked approved answers', async () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({
      question: `Parking option ${index}`,
      answer: 'Parking is available.',
      keywords: index === 4 ? ['parking'] : [],
      locationId: null,
      updatedAt: new Date(updatedAt.getTime() + index),
    }));
    const service = new VoiceFaqService({
      searchApprovedFAQCandidates: jest.fn().mockResolvedValue(candidates),
      hasApprovedLocationSpecificMatch: jest.fn(),
    } as never);
    const result = await service.search(context(false), 'parking');
    expect(result.matches).toHaveLength(3);
    expect(result.matches[0].question).toBe('Parking option 4');
  });

  it('distinguishes a location-required miss without exposing locations', async () => {
    const hasApprovedLocationSpecificMatch = jest.fn().mockResolvedValue(true);
    const service = new VoiceFaqService({
      searchApprovedFAQCandidates: jest.fn().mockResolvedValue([]),
      hasApprovedLocationSpecificMatch,
    } as never);
    await expect(
      service.search(context(false), 'opening hours'),
    ).resolves.toEqual({
      found: false,
      matches: [],
      requiresLocation: true,
    });
    expect(hasApprovedLocationSpecificMatch).toHaveBeenCalledWith({
      tenantId,
      terms: ['opening', 'hours'],
    });
  });

  it('does not perform cross-location detection after a resolved-location miss', async () => {
    const hasApprovedLocationSpecificMatch = jest.fn();
    const service = new VoiceFaqService({
      searchApprovedFAQCandidates: jest.fn().mockResolvedValue([]),
      hasApprovedLocationSpecificMatch,
    } as never);
    await expect(service.search(context(), 'unknown')).resolves.toEqual({
      found: false,
      matches: [],
    });
    expect(hasApprovedLocationSpecificMatch).not.toHaveBeenCalled();
  });

  it('scopes candidates to a validated selected-location override', async () => {
    const selectedLocationId = '33333333-3333-4333-8333-333333333333';
    const searchApprovedFAQCandidates = jest.fn().mockResolvedValue([
      {
        question: 'Is parking available?',
        answer: 'Gulshan parking is available.',
        keywords: ['parking'],
        locationId: selectedLocationId,
        updatedAt,
      },
      {
        question: 'Do you accept cards?',
        answer: 'Cards are accepted at every clinic.',
        keywords: ['cards'],
        locationId: null,
        updatedAt,
      },
    ]);
    const service = new VoiceFaqService({
      searchApprovedFAQCandidates,
      hasApprovedLocationSpecificMatch: jest.fn(),
    } as never);

    await service.search(context(), 'parking', selectedLocationId);

    expect(searchApprovedFAQCandidates).toHaveBeenCalledWith({
      tenantId,
      locationId: selectedLocationId,
      terms: ['parking'],
    });
  });
});
