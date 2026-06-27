import {
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PROFILES, type Profile } from '../../config/constants';

/** Ask the agent for a (user-editable) allocation suggestion for a custom goal. */
export class SuggestDto {
  @IsIn(PROFILES)
  profile!: Profile;

  @IsNumberString()
  targetAmountUsd!: string;

  @IsInt()
  @Min(1970)
  targetYear!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
