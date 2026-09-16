import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Dev-only body to advance a fake shipment and fire Creato webhook.
 */
export class AdvanceStatusDto {
  @IsOptional()
  @IsString()
  awb?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  shipment_id?: number;

  @IsString()
  current_status: string;
}
