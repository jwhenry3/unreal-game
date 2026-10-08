import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AddInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  itemKey: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity = 1;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  container = 'inventory';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  slotIndex?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durability?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isBound?: boolean;
}
