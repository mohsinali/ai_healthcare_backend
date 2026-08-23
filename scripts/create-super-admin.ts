import 'dotenv/config';
import { PrismaClient, PlatformRole, UserStatus } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { createInterface } from 'readline/promises';
import { stdin, stdout } from 'process';
import { assertPasswordPolicy } from '../src/auth/password-policy';
import { normalizeEmail } from '../src/users/users.service';

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? await rl.question('Email: '));
  const firstName = (process.env.ADMIN_FIRST_NAME ?? await rl.question('First name: ')).trim();
  const lastName = (process.env.ADMIN_LAST_NAME ?? await rl.question('Last name: ')).trim();
  const password = process.env.ADMIN_PASSWORD ?? await rl.question('Password (input may be visible): '); rl.close();
  assertPasswordPolicy(password); if (!email || !firstName || !lastName) throw new Error('All fields are required.');
  const prisma = new PrismaClient();
  try { await prisma.user.create({ data: { email, firstName, lastName, passwordHash: await hash(password, { type: argon2id }), platformRole: PlatformRole.SUPER_ADMIN, status: UserStatus.ACTIVE } }); stdout.write(`SUPER_ADMIN created for ${email}\n`); }
  finally { await prisma.$disconnect(); }
}
main().catch((error: unknown) => { const message = error instanceof Error ? error.message : 'Unable to create user'; console.error(message); process.exitCode = 1; });
