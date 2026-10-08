import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class PutEquipmentDto {
  @IsUUID() inventoryItemId: string;
  @IsOptional() @IsBoolean() isVisible?: boolean;
}
