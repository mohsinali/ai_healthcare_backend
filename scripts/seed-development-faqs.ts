import 'dotenv/config';
import { FAQCategory, FAQStatus, TenantRole } from '@prisma/client';
import { stdout } from 'node:process';
import { PrismaService } from '../src/database/prisma.service';
import { CreateFaqDto } from '../src/faqs/dto/faq.dto';
import { FaqsService } from '../src/faqs/faqs.service';
import { SequenceService } from '../src/sequences/sequence.service';
import { TrustedTenantContext } from '../src/tenants/types/tenant-context';

const tenantId = '4fcce3d6-3730-4add-a7e1-a90e6a5baf3f';
const actorUserId = '3e3a9457-b151-4b16-adb8-e1693a90548e';
const locationIds = [
  '1abc2bbe-9002-46a7-8558-dc9d418af4c9',
  '781bd6ab-e81b-4f40-8bb0-ddc854cccd88',
  'd1a36a19-2a40-46b4-8242-8b50f211c89a',
] as const;

type SeedFaq = CreateFaqDto & { status: FAQStatus };

function faq(
  category: FAQCategory,
  question: string,
  answer: string,
  keywords: string[],
  options: { locationId?: string; status?: FAQStatus } = {},
): SeedFaq {
  return {
    category,
    question,
    answer,
    keywords,
    locationId: options.locationId,
    status: options.status ?? FAQStatus.ACTIVE,
  };
}

function dataset(input: {
  locations: Map<string, string>;
  serviceNames: string[];
}): SeedFaq[] {
  const blueCross = input.locations.get(locationIds[0])!;
  const qureshi = input.locations.get(locationIds[1])!;
  const lifeCare = input.locations.get(locationIds[2])!;
  const serviceExamples = input.serviceNames.slice(0, 4).join(', ');

  return [
    faq(
      FAQCategory.GENERAL,
      'How can I contact the clinic?',
      'Call your preferred clinic location during its opening hours. Staff can help with scheduling and other front-desk questions.',
      ['contact', 'phone', 'call clinic', 'front desk'],
    ),
    faq(
      FAQCategory.GENERAL,
      'What information should I have ready when I call?',
      'Please have your name, date of birth, preferred location, and the reason for your call ready. If you are calling about an existing appointment, the appointment date and time are also helpful.',
      ['call', 'information', 'date of birth', 'appointment details'],
    ),
    faq(
      FAQCategory.GENERAL,
      'Can I speak with a staff member?',
      'Yes. Ask to be connected with the front desk, or leave your name, contact number, and a brief administrative message for a return call.',
      ['staff', 'person', 'front desk', 'representative', 'callback'],
    ),

    faq(
      FAQCategory.HOURS,
      'What are your opening hours?',
      'Hours vary by location. Please specify your preferred location so the front desk can confirm its current opening times.',
      ['hours', 'opening times', 'closing time', 'schedule'],
    ),
    faq(
      FAQCategory.HOURS,
      `What are the weekday hours at ${blueCross}?`,
      `${blueCross} is configured for 9:00 AM to 5:00 PM on Monday and Wednesday through Friday, and 10:00 AM to 5:00 PM on Tuesday. It is closed on Saturday and Sunday.`,
      ['hours', 'weekday', 'weekend', 'opening times'],
      { locationId: locationIds[0] },
    ),
    faq(
      FAQCategory.HOURS,
      `When is ${qureshi} open?`,
      `${qureshi} is configured for 9:00 AM to 5:00 PM, Monday through Friday, and is closed on Saturday and Sunday.`,
      ['hours', 'open', 'weekend', 'closing time'],
      { locationId: locationIds[1] },
    ),
    faq(
      FAQCategory.HOURS,
      `Is ${lifeCare} open on weekends?`,
      `${lifeCare} is configured for 9:00 AM to 5:00 PM, Monday through Friday, and is closed on Saturday and Sunday.`,
      ['weekend', 'Saturday', 'Sunday', 'hours'],
      { locationId: locationIds[2] },
    ),

    faq(
      FAQCategory.LOCATION,
      'How do I find the correct clinic location?',
      'Confirm the location name and address shown in your appointment details before travelling. If you are unsure, contact the front desk and provide your appointment date and time.',
      ['location', 'address', 'directions', 'clinic site'],
    ),
    faq(
      FAQCategory.LOCATION,
      `Where is ${blueCross}?`,
      `${blueCross} is at JM 884, Allama Binori Town, Karachi, Sindh 74800. Please confirm this location name when arranging transport or asking for directions.`,
      ['address', 'directions', 'Jamshed Road', 'Karachi'],
      { locationId: locationIds[0] },
    ),
    faq(
      FAQCategory.LOCATION,
      `What address should I use for ${qureshi}?`,
      `Use B-87 Block 1, Gulistan e Jauhar, Karachi, Sindh 75230 for ${qureshi}. Confirm the clinic name in your appointment details before travelling.`,
      ['address', 'directions', 'Gulistan e Jauhar', 'Karachi'],
      { locationId: locationIds[1] },
    ),
    faq(
      FAQCategory.LOCATION,
      `How do I get to ${lifeCare}?`,
      `${lifeCare} is listed at M2G8+M4V, G-10 Markaz, Islamabad, Punjab 75230. Check your appointment details and ask the front desk if you need help identifying the correct entrance.`,
      ['address', 'directions', 'G-10 Markaz', 'Islamabad'],
      { locationId: locationIds[2] },
    ),

    faq(
      FAQCategory.PARKING,
      'Is parking available at the clinic?',
      'Parking arrangements vary by location. Contact your preferred location before travelling for current parking guidance and nearby options.',
      ['parking', 'car park', 'vehicle parking', 'parking lot'],
    ),
    faq(
      FAQCategory.PARKING,
      'Do I need to allow extra time for parking?',
      'It is sensible to allow extra travel and parking time, especially on a first visit. Contact the location if you need current arrival or drop-off guidance.',
      ['parking', 'arrival time', 'drop-off', 'travel'],
      { status: FAQStatus.INACTIVE },
    ),

    faq(
      FAQCategory.APPOINTMENTS,
      'How do I book an appointment?',
      'Contact the clinic with your preferred location, the type of visit you need, and suitable dates or times. Staff will help identify an available appointment.',
      ['book', 'schedule', 'appointment', 'availability'],
    ),
    faq(
      FAQCategory.APPOINTMENTS,
      'Can I reschedule my appointment?',
      'Yes. Contact the clinic as soon as possible with your current appointment details and preferred new times. Availability may vary by location and service.',
      ['reschedule', 'move appointment', 'change appointment', 'new time'],
    ),
    faq(
      FAQCategory.APPOINTMENTS,
      'How do I cancel my appointment?',
      'Contact the clinic as early as possible and provide your name and appointment details. Staff can confirm when the cancellation has been recorded.',
      ['cancel', 'cancellation', 'cancel appointment', 'appointment change'],
    ),
    faq(
      FAQCategory.APPOINTMENTS,
      'How can I confirm my appointment?',
      'Contact the front desk with your name, date of birth, and expected appointment date. Staff can verify the location, date, and time on the booking.',
      ['confirm', 'appointment confirmation', 'booking', 'date and time'],
    ),
    faq(
      FAQCategory.APPOINTMENTS,
      'Do you offer walk-in appointments?',
      'Walk-in availability is not guaranteed and can vary by location and day. Contact the clinic before travelling to ask about current availability.',
      ['walk-in', 'same day', 'no appointment', 'availability'],
      { status: FAQStatus.INACTIVE },
    ),

    faq(
      FAQCategory.INSURANCE,
      'Do you accept insurance?',
      'We work with insurance arrangements, but coverage can vary by plan and service. Contact the clinic or your insurer to confirm eligibility before your visit.',
      ['insurance', 'coverage', 'insurance plan', 'benefits'],
    ),
    faq(
      FAQCategory.INSURANCE,
      'How can I check whether my insurance covers my visit?',
      'Ask your insurer about coverage for the service and clinic location you plan to use. The clinic can provide administrative details needed for that enquiry but cannot guarantee your plan benefits.',
      ['insurance', 'eligibility', 'coverage check', 'benefits'],
    ),
    faq(
      FAQCategory.INSURANCE,
      'What insurance information should I bring?',
      'Bring your current insurance card or policy details and a photo ID if available. Also bring any referral or authorization information your insurer has provided.',
      [
        'insurance card',
        'policy details',
        'photo ID',
        'authorization',
        'referral',
      ],
    ),

    faq(
      FAQCategory.PAYMENTS,
      'What payment methods can I use?',
      'Available payment methods may vary by location. Contact the front desk before your visit if you need to confirm a particular payment option.',
      ['payment', 'pay', 'payment method', 'card', 'cash'],
    ),
    faq(
      FAQCategory.PAYMENTS,
      'When is payment due?',
      'The front desk can explain when payment is expected for your booking and whether any amount is due at check-in or checkout. Confirm this before your visit if you have questions.',
      ['payment due', 'pay', 'check-in', 'checkout'],
    ),
    faq(
      FAQCategory.PAYMENTS,
      'Who can help with a billing question?',
      'Contact the clinic front desk with your name and the relevant visit or billing details. Staff can route your question to the appropriate person.',
      ['billing', 'invoice', 'payment question', 'account', 'staff'],
    ),

    faq(
      FAQCategory.SERVICES,
      'What services do you offer?',
      `Configured services include ${serviceExamples}, among others. Availability can vary by location, so contact the clinic to confirm the right location and booking type.`,
      ['services', 'appointments', 'available care', 'visit type'],
    ),
    faq(
      FAQCategory.SERVICES,
      'How do I choose the correct service?',
      'Describe the purpose of your visit in general terms to the scheduling staff. They can help select the appropriate configured appointment type without providing clinical advice.',
      ['choose service', 'appointment type', 'booking help', 'services'],
    ),
    faq(
      FAQCategory.SERVICES,
      'Can I book a New Patient Consultation?',
      'New Patient Consultation is an available service. Contact the clinic to confirm location availability and choose a suitable appointment time.',
      ['new patient consultation', 'new patient', 'services', 'book'],
    ),

    faq(
      FAQCategory.PREPARATION,
      'What should I bring to my appointment?',
      'Bring a photo ID if available, current insurance or payment information, and any administrative documents the clinic asked you to provide. Keep your appointment details handy for check-in.',
      ['bring', 'documents', 'photo ID', 'insurance card', 'appointment'],
    ),
    faq(
      FAQCategory.PREPARATION,
      'What should a new patient bring?',
      'New patients should bring identification if available, contact and insurance details, and any forms or referral documents requested during booking. Ask the front desk if you are unsure what applies to your visit.',
      ['new patient', 'first visit', 'documents', 'forms', 'referral'],
    ),
    faq(
      FAQCategory.PREPARATION,
      'How early should I arrive?',
      'Allow enough time for parking and check-in. Ask the location when booking whether you should arrive early to complete new-patient or administrative forms.',
      ['arrive early', 'check-in', 'arrival time', 'forms'],
    ),

    faq(
      FAQCategory.POLICIES,
      'What happens if I need to cancel?',
      'Contact the clinic as soon as you know you cannot attend. Staff can explain any cancellation policy that applies to your booking and help with next steps.',
      ['cancellation policy', 'cancel', 'cannot attend', 'appointment'],
    ),
    faq(
      FAQCategory.POLICIES,
      'What happens if I arrive late?',
      'Call the clinic if you expect to be late. Staff will advise whether the appointment can still go ahead or needs to be rescheduled.',
      ['late', 'running late', 'reschedule', 'arrival'],
    ),
    faq(
      FAQCategory.POLICIES,
      'Can someone else call about my appointment?',
      'Another person may contact the clinic, but staff may need your permission before discussing or changing appointment information. They will explain what verification is required.',
      ['representative', 'permission', 'appointment changes', 'privacy'],
    ),

    faq(
      FAQCategory.ACCESSIBILITY,
      'Is the clinic wheelchair accessible?',
      'Accessibility features vary by location. Contact your preferred location before travelling to confirm entrance, lift, wheelchair, and accessible parking arrangements.',
      ['wheelchair', 'accessible', 'accessibility', 'entrance', 'lift'],
    ),
    faq(
      FAQCategory.ACCESSIBILITY,
      'Can I request assistance when I arrive?',
      'Yes. Contact the location before your visit to describe the practical assistance you need at arrival or check-in. Staff will confirm what can be arranged.',
      ['assistance', 'accessibility', 'arrival help', 'check-in'],
    ),

    faq(
      FAQCategory.OTHER,
      'What if the automated assistant cannot answer my question?',
      'Ask to speak with a staff member or leave a brief message with your name and contact number. For urgent or emergency concerns, use the appropriate local emergency service rather than waiting for a routine callback.',
      ['automated assistant', 'staff', 'message', 'callback', 'emergency'],
      { status: FAQStatus.INACTIVE },
    ),
  ];
}

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed development FAQs in production.');

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const [tenant, actor, locations, services] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.user.findUnique({
        where: { id: actorUserId },
        include: { tenantMemberships: { where: { tenantId } } },
      }),
      prisma.location.findMany({
        where: { id: { in: [...locationIds] } },
        select: { id: true, tenantId: true, name: true },
      }),
      prisma.service.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    if (!tenant) throw new Error(`Tenant ${tenantId} was not found.`);
    if (!actor) throw new Error(`Actor user ${actorUserId} was not found.`);
    if (
      !actor.tenantMemberships.some(
        (membership) => membership.status === 'ACTIVE',
      )
    )
      throw new Error(
        `Actor user ${actorUserId} has no active membership in tenant ${tenantId}.`,
      );
    const invalidLocations = locationIds.filter(
      (id) =>
        !locations.some(
          (location) => location.id === id && location.tenantId === tenantId,
        ),
    );
    if (invalidLocations.length)
      throw new Error(
        `Required locations missing from the tenant: ${invalidLocations.join(', ')}`,
      );
    if (!services.length)
      throw new Error(`Tenant ${tenantId} has no active services.`);

    const context: TrustedTenantContext = {
      tenantId,
      tenantSlug: tenant.slug,
      tenantRole: TenantRole.CLINIC_OWNER,
      membershipId: actor.tenantMemberships[0].id,
    };
    const faqsService = new FaqsService(prisma, new SequenceService(prisma));
    const records = dataset({
      locations: new Map(
        locations.map((location) => [location.id, location.name]),
      ),
      serviceNames: services.map((service) => service.name),
    });
    const categories = new Set(records.map((record) => record.category));
    const missingCategories = Object.values(FAQCategory).filter(
      (category) => !categories.has(category),
    );
    if (missingCategories.length)
      throw new Error(
        `Seed dataset omits FAQ categories: ${missingCategories.join(', ')}`,
      );

    let created = 0;
    let skipped = 0;
    for (const record of records) {
      const existing = await prisma.fAQ.findFirst({
        where: {
          tenantId,
          locationId: record.locationId ?? null,
          question: record.question.trim(),
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      const { status, ...dto } = record;
      const createdFaq = await faqsService.create(context, dto);
      if (status === FAQStatus.INACTIVE)
        await faqsService.status(context, createdFaq.id, status);
      created += 1;
    }

    const [allFaqs, sequence] = await Promise.all([
      prisma.fAQ.findMany({
        where: { tenantId },
        select: {
          faqNumber: true,
          locationId: true,
          category: true,
          status: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.sequence.findUnique({
        where: { tenantId_type: { tenantId, type: 'FAQ' } },
      }),
    ]);
    const result = {
      tenantId,
      actorUserId,
      locations: locations.sort((a, b) => a.name.localeCompare(b.name)),
      servicesUsed: services.map((service) => service.name),
      created,
      skipped,
      total: allFaqs.length,
      tenantWide: allFaqs.filter((item) => item.locationId === null).length,
      byLocation: Object.fromEntries(
        locationIds.map((id) => [
          id,
          allFaqs.filter((item) => item.locationId === id).length,
        ]),
      ),
      byCategory: Object.fromEntries(
        Object.values(FAQCategory).map((category) => [
          category,
          allFaqs.filter((item) => item.category === category).length,
        ]),
      ),
      byStatus: Object.fromEntries(
        Object.values(FAQStatus).map((status) => [
          status,
          allFaqs.filter((item) => item.status === status).length,
        ]),
      ),
      firstFaqNumber: allFaqs.at(0)?.faqNumber ?? null,
      lastFaqNumber: allFaqs.at(-1)?.faqNumber ?? null,
      sequenceNextValue: sequence?.nextValue ?? null,
    };
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Unable to seed development FAQs.',
  );
  process.exitCode = 1;
});
