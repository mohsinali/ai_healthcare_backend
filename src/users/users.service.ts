import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const safeUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  platformRole: true,
  status: true,
} satisfies Prisma.UserSelect;
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  findForAuthentication(email: string) {
    return this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
  }
  findActiveById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, status: 'ACTIVE' },
      select: safeUserSelect,
    });
  }
}
