import { IsUUID } from 'class-validator';

export class MailAttachmentDto {
  @IsUUID()
  inventoryItemId: string;
}
