import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class BootstrapUserResponseDto {
  @ApiProperty({ example: 'user_1' })
  userId: string;

  @ApiProperty({ example: 'admin@example.com' })
  email: string;

  @ApiProperty({ example: 'admin', enum: UserRole })
  role: UserRole;
}
