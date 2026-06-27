import { IsIn } from 'class-validator';
import { PROFILES, type Profile } from '../../config/constants';

export class StarterDto {
  @IsIn(PROFILES)
  profile!: Profile;
}
