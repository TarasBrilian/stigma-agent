import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsObject,
  IsString,
  Min,
} from 'class-validator';
import { PROFILES, type Profile } from '../../config/constants';

/**
 * Register the off-chain mirror of a vault AFTER the user signed `create_vault`
 * in the frontend (architecture §6). The contract is authoritative; the service
 * still fails fast if `baseAllocation` is not a valid Σ=10000 allocation.
 */
export class RegisterPortfolioDto {
  @IsString()
  @IsNotEmpty()
  vaultHash!: string;

  /** Owner wallet (public key hex). */
  @IsString()
  @IsNotEmpty()
  owner!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(PROFILES)
  profile!: Profile;

  /** Growth-tilted start allocation chosen at creation (bps, Σ = 10000). */
  @IsObject()
  baseAllocation!: Record<string, number>;

  /** Goal amount as raw USD (6 dp). */
  @IsNumberString()
  targetAmountUsd!: string;

  @IsInt()
  @Min(1970)
  targetYear!: number;
}
