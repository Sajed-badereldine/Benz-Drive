import { IsEnum, IsNotEmpty, IsOptional, IsString, IsEmail } from 'class-validator';
import { ShareRole } from '../entities/share.entity';

export class ShareItemDto {
  @IsNotEmpty()
  @IsString()
  itemId: string;

  @IsNotEmpty()
  @IsEnum(['file', 'folder'])
  itemType: 'file' | 'folder';

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(ShareRole)
  role?: ShareRole = ShareRole.VIEWER;
}
