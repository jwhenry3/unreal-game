import { IsObject, IsOptional, IsUUID } from 'class-validator';

export class PlaceFurnishingDto {
  @IsUUID()
  inventoryItemId: string;

  @IsObject()
  transform: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
