import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PutJobProgressDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000)
  level: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  experience: number;

  @IsOptional()
  @IsBoolean()
  isUnlocked?: boolean;
}
