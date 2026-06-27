import { IsNotEmpty, IsNumberString, IsString } from 'class-validator';

export class FaucetDto {
  /** Recipient wallet (owner) public key. */
  @IsString()
  @IsNotEmpty()
  owner!: string;

  /** Raw mUSDC amount, 6 dp. */
  @IsNumberString()
  amount!: string;
}
