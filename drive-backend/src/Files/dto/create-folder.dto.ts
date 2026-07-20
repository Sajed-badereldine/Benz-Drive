import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  @IsNotEmpty({ message: 'Folder name cannot be empty' })
  name: string;

  @IsOptional()
  @IsUUID('4', { message: 'Invalid parent folder ID' })
  parentFolderId?: string;
}
