import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class EmitDomainEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  type: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  aggregateType: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  aggregateId: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
