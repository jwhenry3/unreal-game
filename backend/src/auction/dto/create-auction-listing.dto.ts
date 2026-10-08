import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateAuctionListingDto {
  @IsUUID()
  inventoryItemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  startingBid: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  buyoutPrice?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  durationHours: number;
}
