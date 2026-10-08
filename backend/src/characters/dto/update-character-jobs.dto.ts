import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

const JOB_PATTERN = /^[a-zA-Z0-9 _-]+$/;

export class UpdateCharacterJobsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(JOB_PATTERN)
  mainJob?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((dto: UpdateCharacterJobsDto) => dto.subJob !== null)
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(JOB_PATTERN)
  subJob?: string | null;
}
