import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class InternalMailAttachmentDto {
  @IsIn(['item', 'currency'])
  type: 'item' | 'currency';

  @ValidateIf((attachment: InternalMailAttachmentDto) => attachment.type === 'item')
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  itemKey?: string;

  @ValidateIf((attachment: InternalMailAttachmentDto) => attachment.type === 'item')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity?: number;

  @ValidateIf((attachment: InternalMailAttachmentDto) => attachment.type === 'currency')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  currency?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durability?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class InternalSendMailDto {
  @IsUUID()
  recipientCharacterId: string;

  @IsOptional()
  @IsUUID()
  senderCharacterId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  subject: string;

  @IsString()
  @MaxLength(10_000)
  body: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => InternalMailAttachmentDto)
  attachments?: InternalMailAttachmentDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8_760)
  expiresInHours?: number;
}
