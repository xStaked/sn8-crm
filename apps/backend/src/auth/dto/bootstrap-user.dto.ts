import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class BootstrapUserDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'change-me-please', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ 
    example: 'admin', 
    enum: UserRole, 
    description: 'Rol del usuario (admin o user). Por defecto: user' 
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
