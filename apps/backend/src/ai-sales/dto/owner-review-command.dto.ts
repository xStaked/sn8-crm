import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export enum OwnerReviewAction {
  APPROVE = 'approve',
  REVISE = 'revise',
}

export class OwnerReviewCommandDto {
  @IsEnum(OwnerReviewAction)
  action!: OwnerReviewAction;

  @IsString()
  @IsNotEmpty()
  conversationId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  reviewerPhone?: string;

  @ValidateIf((value) => value.action === OwnerReviewAction.REVISE)
  @IsString()
  @IsNotEmpty()
  feedback?: string;
}
