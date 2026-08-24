import 'dotenv/config';
import { PrismaClient, UserStatus } from '@prisma/client';
import { argon2id, hash } from 'argon2';
import { createInterface } from 'readline/promises';
import { stdin, stdout } from 'process';
import { assertPasswordPolicy } from '../src/auth/password-policy';
import { normalizeEmail } from '../src/users/users.service';
async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const email = normalizeEmail(await rl.question('Email: '));
  const firstName = (await rl.question('First name: ')).trim();
  const lastName = (await rl.question('Last name: ')).trim();
  const password = await rl.question('Password (input may be visible): ');
  rl.close();
  assertPasswordPolicy(password);
  if (!email || !firstName || !lastName)
    throw new Error('All fields are required.');
  const prisma = new PrismaClient();
  try {
    await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash: await hash(password, { type: argon2id }),
        platformRole: null,
        status: UserStatus.ACTIVE,
      },
    });
    stdout.write(`Application user created for ${email}\n`);
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Unable to create user',
  );
  process.exitCode = 1;
});
