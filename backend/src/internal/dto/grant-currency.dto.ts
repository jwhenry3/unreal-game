import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class GrantCurrencyDto {
  @Type(() => Number)
  @IsInt()
  @Min(-2_000_000_000)
  @Max(2_000_000_000)
  amount: number;
}
