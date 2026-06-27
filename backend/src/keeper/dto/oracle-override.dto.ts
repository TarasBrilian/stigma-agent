import { IsIn, IsNumberString } from 'class-validator';
import { ASSET_SYMBOLS, type AssetSymbol } from '../../config/constants';

export class OracleOverrideDto {
  @IsIn([...ASSET_SYMBOLS])
  token!: AssetSymbol;

  /** Raw USD price, 6 dp (e.g. "65000000000" = $65,000.00). */
  @IsNumberString()
  price!: string;
}
