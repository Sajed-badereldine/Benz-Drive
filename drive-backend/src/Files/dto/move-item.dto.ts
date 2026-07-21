import { IsOptional, IsString } from 'class-validator';

export class MoveItemDto {
  @IsString()
  @IsOptional()
  targetFolderId?: string | null;
}
