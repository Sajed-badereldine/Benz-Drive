import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { Files } from './entities/files.entity';
import { Folder } from './entities/folder.entity'; // Import Folder

@Module({
  imports: [
    TypeOrmModule.forFeature([Files, Folder]) // Register both entities
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
