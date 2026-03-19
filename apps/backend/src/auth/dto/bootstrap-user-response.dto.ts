import { ApiProperty } from '@nestjs/swagger';

export class BootstrapUserResponseDto {
  @ApiProperty({ example: 'user_1' })
  userId: string;

  @ApiProperty({ example: 'admin@example.com' })
  email: string;
}
