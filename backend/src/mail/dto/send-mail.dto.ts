import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MailAttachmentDto } from './mail-attachment.dto';

export class SendMailDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  recipientRealm?: string;

  @IsOptional()
  @IsUUID()
  recipientCharacterId?: string;

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
  @Type(() => MailAttachmentDto)
  attachments?: MailAttachmentDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8_760)
  expiresInHours?: number;
}
