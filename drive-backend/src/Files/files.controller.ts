import { Controller, Post, Get, Delete, UseGuards, UseInterceptors, UploadedFile, Param, Req, Res, ParseFilePipeBuilder, HttpStatus, Body, Patch, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { MoveItemDto } from './dto/move-item.dto';
import type { Response } from 'express';

@Controller('files')
@UseGuards(AuthGuard('jwt')) // Protects all file & folder endpoints using JWT validation
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // 1. Upload File (POST /files/upload)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file')) // Intercept multipart/form-data files under the name 'file'
  async uploadFile(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: 50 * 1024 * 1024, // 50 MB
          message: 'File size exceeds the maximum limit of 50 MB. Please choose a smaller file.',
        })
        .build({
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: Express.Multer.File,
    @Req() req: any,
    @Body('folderId') folderId?: string,
  ) {
    return this.filesService.uploadFile(file, req.user.id, folderId || null);
  }

  // 1.5 Get Presigned Upload URL (POST /files/presigned-upload)
  @Post('presigned-upload')
  async getPresignedUploadUrl(
    @Req() req: any,
    @Body('fileName') fileName: string,
    @Body('fileSize') fileSize: number,
    @Body('mimeType') mimeType: string,
    @Body('folderId') folderId?: string,
  ) {
    return this.filesService.getPresignedUploadUrl(
      req.user.id,
      fileName,
      fileSize,
      mimeType,
      folderId || null,
    );
  }

  // 1.6 Confirm File Upload (POST /files/confirm-upload/:id)
  @Post('confirm-upload/:id')
  async confirmUpload(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.filesService.confirmUpload(id, req.user.id);
  }

  // 2. List Files (GET /files)
  @Get()
  async listFiles(@Req() req: any) {
    return this.filesService.listUserFiles(req.user.id);
  }

  // 2.5 Search Files & Folders globally (GET /files/search?query=abc)
  @Get('search')
  async searchItems(
    @Query('query') query: string,
    @Req() req: any,
  ) {
    return this.filesService.searchItems(query || '', req.user.id);
  }

  // 2.6 Get Total Storage Usage (GET /files/storage/usage)
  @Get('storage/usage')
  async getStorageUsage(@Req() req: any) {
    return this.filesService.getUserStorageUsage(req.user.id);
  }

  // 3. Download/Stream File (GET /files/download/:id)
  @Get('download/:id')
  async downloadFile(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { stream, fileName, contentType } = await this.filesService.getFileStream(id, req.user.id);

    // Set headers so the browser downloads it with the correct file name and type
    res.set({
      'Content-Type': contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    });

    // Pipe the S3 readable stream directly into the Express HTTP response
    (stream as any).pipe(res);
  }

  // 4. Delete File (DELETE /files/:id) - WARNING: Hard delete (use Trash endpoint instead for soft delete)
  @Delete(':id')
  async deleteFile(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.filesService.deleteFile(id, req.user.id);
  }

  // 5. Create Folder (POST /files/folders)
  @Post('folders')
  async createFolder(
    @Body() createFolderDto: CreateFolderDto,
    @Req() req: any,
  ) {
    return this.filesService.createFolder(createFolderDto, req.user.id);
  }

  // 6. Get Folder Contents - Root (GET /files/folders/content)
  @Get('folders/content')
  async getRootFolderContents(@Req() req: any) {
    return this.filesService.getFolderContents(null, req.user.id);
  }

  // 7. Get Folder Contents - Nested (GET /files/folders/content/:id)
  @Get('folders/content/:id')
  async getFolderContents(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.filesService.getFolderContents(id, req.user.id);
  }

  // 7.5 Get Trashed Folder Contents (GET /files/folders/content-trashed/:id)
  @Get('folders/content-trashed/:id')
  async getTrashedFolderContents(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.filesService.getTrashedFolderContents(id, req.user.id);
  }

  // 8. Get Breadcrumbs (GET /files/folders/:id/breadcrumbs)
  @Get('folders/:id/breadcrumbs')
  async getBreadcrumbs(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.filesService.getBreadcrumbs(id, req.user.id);
  }

  // 8.5 Get Trashed Breadcrumbs (GET /files/folders/:id/breadcrumbs-trashed)
  @Get('folders/:id/breadcrumbs-trashed')
  async getTrashedBreadcrumbs(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.filesService.getTrashedBreadcrumbs(id, req.user.id);
  }

  // 9. Trash File (PATCH /files/:id/trash)
  @Patch(':id/trash')
  async trashFile(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.filesService.trashFile(id, req.user.id);
  }

  // 10. Restore File (PATCH /files/:id/restore)
  @Patch(':id/restore')
  async restoreFile(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.filesService.restoreFile(id, req.user.id);
  }

  // 11. Trash Folder (PATCH /files/folders/:id/trash)
  @Patch('folders/:id/trash')
  async trashFolder(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.filesService.trashFolder(id, req.user.id);
  }

  // 12. Restore Folder (PATCH /files/folders/:id/restore)
  @Patch('folders/:id/restore')
  async restoreFolder(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.filesService.restoreFolder(id, req.user.id);
  }

  // 13. Get Trashed Items (GET /files/trash)
  @Get('trash/all')
  async getTrashedItems(@Req() req: any) {
    return this.filesService.getTrashedItems(req.user.id);
  }

  // 14. Empty Trash (DELETE /files/trash/empty)
  @Delete('trash/empty')
  async emptyTrash(@Req() req: any) {
    return this.filesService.emptyTrash(req.user.id);
  }

  // 15. Move File (PATCH /files/:id/move)
  @Patch(':id/move')
  async moveFile(
    @Param('id') id: string,
    @Body() moveItemDto: MoveItemDto,
    @Req() req: any,
  ) {
    return this.filesService.moveFile(id, moveItemDto.targetFolderId || null, req.user.id);
  }

  // 16. Move Folder (PATCH /files/folders/:id/move)
  @Patch('folders/:id/move')
  async moveFolder(
    @Param('id') id: string,
    @Body() moveItemDto: MoveItemDto,
    @Req() req: any,
  ) {
    return this.filesService.moveFolder(id, moveItemDto.targetFolderId || null, req.user.id);
  }
}
