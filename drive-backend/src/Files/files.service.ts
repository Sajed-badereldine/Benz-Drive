import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, ILike } from 'typeorm';
import { Files, UploadStatus, FileType } from './entities/files.entity';
import { Folder } from './entities/folder.entity';
import { CreateFolderDto } from './dto/create-folder.dto';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';

@Injectable()
export class FilesService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(
    @InjectRepository(Files)
    private readonly filesRepository: Repository<Files>,
    @InjectRepository(Folder)
    private readonly folderRepository: Repository<Folder>,
    private readonly configService: ConfigService,
  ) {
    this.bucketName = this.configService.get<string>('aws.bucketName')!;

    const accessKeyId = this.configService.get<string>('aws.accessKeyId');
    const secretAccessKey = this.configService.get<string>('aws.secretAccessKey');
    const endpoint = this.configService.get<string>('aws.endpoint');

    const s3Config: any = {
      region: this.configService.get<string>('aws.region') || 'eu-central-1',
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    };

    if (accessKeyId && secretAccessKey) {
      s3Config.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }

    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.forcePathStyle = true;
    }

    this.s3Client = new S3Client(s3Config);
  }

  // 1. Upload file to S3 and save metadata in DB
  async uploadFile(file: Express.Multer.File, userId: string, folderId: string | null = null): Promise<Files> {
    // Enforce 500 MB total user storage quota
    const quotaBytes = 500 * 1024 * 1024; // 500 MB

    // Calculate current usage (sum sizeBytes of non-trashed files)
    const usageResult = await this.filesRepository
      .createQueryBuilder('file')
      .select('SUM(file.sizeBytes)', 'sum')
      .where('file.userId = :userId', { userId })
      .andWhere('file.isTrashed = false')
      .getRawOne();

    const currentUsage = parseInt(usageResult.sum || '0', 10);

    if (currentUsage + file.size > quotaBytes) {
      throw new BadRequestException('You have exceeded your total storage limit of 500 MB. Please empty your trash or delete some files to free up space.');
    }

    const fileId = crypto.randomUUID();
    const s3Key = `${userId}/${fileId}-${file.originalname}`;

    // Upload payload command to S3
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    try {
      await this.s3Client.send(command);

      // Save metadata record in PostgreSQL database
      const fileMetadata = this.filesRepository.create({
        id: fileId,
        fileName: file.originalname,
        s3Key: s3Key,
        userId: userId,
        folderId: folderId,
        sizeBytes: file.size,
        fileType: this.getFileType(file.mimetype),
        uploadStatus: UploadStatus.ACTIVE,
      });

      return await this.filesRepository.save(fileMetadata);
    } catch (error) {
      console.error('Failed to upload file to S3:', error);
      throw new BadRequestException('File upload failed');
    }
  }

  // 1.5 Generate S3 Presigned URL for Direct File Upload
  async getPresignedUploadUrl(
    userId: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    folderId: string | null = null,
  ): Promise<{ uploadUrl: string; fileId: string }> {
    const quotaBytes = 500 * 1024 * 1024; // 500 MB

    // Calculate current usage (sum sizeBytes of non-trashed active files)
    const usageResult = await this.filesRepository
      .createQueryBuilder('file')
      .select('SUM(file.sizeBytes)', 'sum')
      .where('file.userId = :userId', { userId })
      .andWhere('file.isTrashed = false')
      .andWhere('file.uploadStatus = :status', { status: UploadStatus.ACTIVE })
      .getRawOne();

    const currentUsage = parseInt(usageResult.sum || '0', 10);

    if (currentUsage + fileSize > quotaBytes) {
      throw new BadRequestException(
        'You have exceeded your total storage limit of 500 MB. Please empty your trash or delete some files to free up space.',
      );
    }

    const fileId = crypto.randomUUID();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `${userId}/${fileId}-${safeFileName}`;

    // Create a pending file metadata record in DB
    const fileMetadata = this.filesRepository.create({
      id: fileId,
      fileName: fileName,
      s3Key: s3Key,
      userId: userId,
      folderId: folderId,
      sizeBytes: fileSize,
      fileType: this.getFileType(mimeType),
      uploadStatus: UploadStatus.PENDING,
    });

    await this.filesRepository.save(fileMetadata);

    // Prepare S3 PutObjectCommand to generate signed URL
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: mimeType,
    });

    try {
      // Generate a signed PUT URL valid for 15 minutes (900 seconds)
      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 900,
      });

      return { uploadUrl, fileId };
    } catch (error) {
      console.error('Failed to generate S3 Presigned URL:', error);
      // Clean up the created pending record on generation failure
      await this.filesRepository.delete(fileId);
      throw new BadRequestException('Failed to generate secure upload link');
    }
  }

  // 1.6 Confirm direct file upload completion
  async confirmUpload(fileId: string, userId: string): Promise<Files> {
    const file = await this.filesRepository.findOne({ where: { id: fileId } });

    if (!file) {
      throw new NotFoundException('File upload record not found');
    }

    if (file.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this file');
    }

    if (file.uploadStatus !== UploadStatus.PENDING) {
      throw new BadRequestException('File is not in a pending upload state');
    }

    // Mark upload status as ACTIVE
    file.uploadStatus = UploadStatus.ACTIVE;
    return await this.filesRepository.save(file);
  }

  // 2. List all files belonging to a specific user
  async listUserFiles(userId: string): Promise<Files[]> {
    return this.filesRepository.find({
      where: { userId, isTrashed: false, uploadStatus: UploadStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  // 3. Get file metadata (with owner access validation)
  async getFileMetadata(fileId: string, userId: string, includeTrashed = false): Promise<Files> {
    const file = await this.filesRepository.findOne({ where: { id: fileId } });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this file');
    }

    if (!includeTrashed && file.isTrashed) {
      throw new BadRequestException('File is in the trash bin');
    }

    return file;
  }

  // 4. Download file from S3 (returns a readable stream)
  async getFileStream(fileId: string, userId: string) {
    const file = await this.getFileMetadata(fileId, userId);

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: file.s3Key,
    });

    try {
      const response = await this.s3Client.send(command);
      return {
        stream: response.Body,
        fileName: file.fileName,
        contentType: response.ContentType,
      };
    } catch (error) {
      console.error('Failed to retrieve file :', error);
      throw new NotFoundException('File could not be retrieved from S3');
    }
  }

  // 5. Delete file from S3 and delete metadata from DB
  async deleteFile(fileId: string, userId: string): Promise<{ message: string }> {
    const file = await this.getFileMetadata(fileId, userId);

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: file.s3Key,
    });

    try {
      // Delete object from S3
      await this.s3Client.send(command);

      // Delete metadata from database
      await this.filesRepository.delete(fileId);

      return { message: 'File successfully deleted' };
    } catch (error) {
      console.error('Failed to delete file :', error);
      throw new Error('Failed to delete file');
    }
  }

  // 6. Create Folder
  async createFolder(createFolderDto: CreateFolderDto, userId: string): Promise<Folder> {
    const { name, parentFolderId } = createFolderDto;

    // If parentFolderId is provided, verify it exists and belongs to the user
    if (parentFolderId) {
      const parentFolder = await this.folderRepository.findOne({
        where: { id: parentFolderId, userId, isTrashed: false },
      });
      if (!parentFolder) {
        throw new NotFoundException('Parent folder not found');
      }
    }

    const folder = this.folderRepository.create({
      name,
      userId,
      parentFolderId: parentFolderId || null,
    });

    return await this.folderRepository.save(folder);
  }

  // 7. Get Folder Contents (Unified listing for files & subfolders)
  async getFolderContents(folderId: string | null, userId: string) {
    let currentFolder: Folder | null = null;
    const isRoot = !folderId || folderId === 'root';

    if (!isRoot) {
      currentFolder = await this.folderRepository.findOne({
        where: { id: folderId!, userId, isTrashed: false },
      });
      if (!currentFolder) {
        throw new NotFoundException('Folder not found');
      }
    }

    // Fetch folders in this directory
    const folders = await this.folderRepository.find({
      where: {
        userId,
        parentFolderId: isRoot ? IsNull() : folderId,
        isTrashed: false,
      },
      order: { name: 'ASC' },
    });

    // Fetch files in this directory
    const files = await this.filesRepository.find({
      where: {
        userId,
        folderId: isRoot ? IsNull() : folderId,
        isTrashed: false,
        uploadStatus: UploadStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });

    return {
      currentFolder,
      folders,
      files,
    };
  }

  // 8. Get Breadcrumbs
  async getBreadcrumbs(folderId: string, userId: string): Promise<Folder[]> {
    const breadcrumbs: Folder[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = await this.folderRepository.findOne({
        where: { id: currentId, userId, isTrashed: false },
      });
      if (!folder) break;
      breadcrumbs.unshift(folder);
      currentId = folder.parentFolderId;
    }

    return breadcrumbs;
  }

  // 9. Trash a single file
  async trashFile(fileId: string, userId: string) {
    const file = await this.getFileMetadata(fileId, userId, false);
    file.isTrashed = true;
    file.trashedAt = new Date();
    await this.filesRepository.save(file);
    return { message: 'File moved to Trash' };
  }

  // 10. Restore a single file from trash
  async restoreFile(fileId: string, userId: string) {
    const file = await this.filesRepository.findOne({
      where: { id: fileId, userId, isTrashed: true },
      relations: { folder: true },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }

    // If parent folder is currently trashed, move restored file to root
    if (file.folderId) {
      const parent = await this.folderRepository.findOne({
        where: { id: file.folderId, userId },
      });
      if (parent && parent.isTrashed) {
        file.folderId = null;
        file.folder = null;
      }
    }

    file.isTrashed = false;
    file.trashedAt = null;
    await this.filesRepository.save(file);
    return { message: 'File successfully restored' };
  }

  // 11. Trash a folder recursively
  async trashFolder(folderId: string, userId: string) {
    const folder = await this.folderRepository.findOne({
      where: { id: folderId, userId, isTrashed: false },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    folder.isTrashed = true;
    folder.trashedAt = new Date();
    await this.folderRepository.save(folder);

    // Recursively trash all items inside this folder
    await this.trashFolderContentsRecursive(folderId, userId);

    return { message: 'Folder and all its contents moved to Trash' };
  }

  // 12. Restore a folder recursively
  async restoreFolder(folderId: string, userId: string) {
    const folder = await this.folderRepository.findOne({
      where: { id: folderId, userId, isTrashed: true },
      relations: { parentFolder: true },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // If parent folder is currently trashed, move restored folder to root
    if (folder.parentFolderId) {
      const parent = await this.folderRepository.findOne({
        where: { id: folder.parentFolderId, userId },
      });
      if (parent && parent.isTrashed) {
        folder.parentFolderId = null;
        folder.parentFolder = null;
      }
    }

    folder.isTrashed = false;
    folder.trashedAt = null;
    await this.folderRepository.save(folder);

    // Recursively restore all items inside this folder
    await this.restoreFolderContentsRecursive(folderId, userId);

    return { message: 'Folder and all its contents restored' };
  }

  // 13. Fetch all trashed files & folders for the user (only top-level)
  async getTrashedItems(userId: string) {
    // Fetch all trashed folders
    const allTrashedFolders = await this.folderRepository.find({
      where: { userId, isTrashed: true },
      order: { trashedAt: 'DESC' },
    });

    // Fetch all active folders to check parent status
    const activeFolders = await this.folderRepository.find({
      where: { userId, isTrashed: false },
    });
    const activeFolderIds = new Set(activeFolders.map(f => f.id));

    // A folder is top-level if its parent is null, or if its parent is NOT trashed (i.e. parent is active)
    const folders = allTrashedFolders.filter(folder =>
      !folder.parentFolderId || activeFolderIds.has(folder.parentFolderId)
    );

    // Fetch all trashed files
    const allTrashedFiles = await this.filesRepository.find({
      where: { userId, isTrashed: true },
      order: { trashedAt: 'DESC' },
    });

    // A file is top-level if its folderId is null, or if its folder is active
    const files = allTrashedFiles.filter(file =>
      !file.folderId || activeFolderIds.has(file.folderId)
    );

    return { folders, files };
  }

  // 14. Empty Trash (Permanently deletes files from S3 + deletes records from DB)
  async emptyTrash(userId: string) {
    const trashedFiles = await this.filesRepository.find({
      where: { userId, isTrashed: true },
    });

    for (const file of trashedFiles) {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: file.s3Key,
      });

      try {
        await this.s3Client.send(command);
      } catch (error) {
        console.error(`Failed to delete S3 key ${file.s3Key} during empty trash:`, error);
      }
    }

    if (trashedFiles.length > 0) {
      await this.filesRepository.delete({ userId, isTrashed: true });
    }

    await this.folderRepository.delete({ userId, isTrashed: true });

    return { message: 'Trash successfully emptied' };
  }

  // Private helper to recursively trash subfolders and files
  private async trashFolderContentsRecursive(folderId: string, userId: string) {
    await this.filesRepository.update(
      { folderId, userId, isTrashed: false },
      { isTrashed: true, trashedAt: new Date() },
    );

    // Find all subfolders in the current folder
    const subfolders = await this.folderRepository.find({
      where: { parentFolderId: folderId, userId, isTrashed: false },
    });

    for (const subfolder of subfolders) {
      subfolder.isTrashed = true;
      subfolder.trashedAt = new Date();
      await this.folderRepository.save(subfolder);

      await this.trashFolderContentsRecursive(subfolder.id, userId);
    }
  }

  // Private helper to recursively restore subfolders and files
  private async restoreFolderContentsRecursive(folderId: string, userId: string) {
    // Restore all files in the current folder
    await this.filesRepository.update(
      { folderId, userId, isTrashed: true },
      { isTrashed: false, trashedAt: null },
    );

    // Find all subfolders in the current folder
    const subfolders = await this.folderRepository.find({
      where: { parentFolderId: folderId, userId, isTrashed: true },
    });

    for (const subfolder of subfolders) {
      subfolder.isTrashed = false;
      subfolder.trashedAt = null;
      await this.folderRepository.save(subfolder);

      await this.restoreFolderContentsRecursive(subfolder.id, userId);
    }
  }

  // Helper: Classify files based on MIME type
  private getFileType(mimetype: string): FileType {
    if (!mimetype) return FileType.OTHER;
    if (mimetype.startsWith('image/')) return FileType.IMAGE;
    if (mimetype.startsWith('video/')) return FileType.VIDEO;
    if (mimetype.startsWith('audio/')) return FileType.AUDIO;

    const documentMimeTypes = [
      'application/pdf',
      'text/plain',
      'text/html',
      'text/css',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];

    if (documentMimeTypes.includes(mimetype) || mimetype.startsWith('text/')) {
      return FileType.DOCUMENT;
    }
    return FileType.OTHER;
  }

  // 15. Search active Files & Folders globally
  async searchItems(query: string, userId: string) {
    if (!query.trim()) {
      return { folders: [], files: [] };
    }

    const folders = await this.folderRepository.find({
      where: {
        userId,
        name: ILike(`%${query}%`),
        isTrashed: false,
      },
      order: { name: 'ASC' },
    });

    const files = await this.filesRepository.find({
      where: {
        userId,
        fileName: ILike(`%${query}%`),
        isTrashed: false,
        uploadStatus: UploadStatus.ACTIVE,
      },
      order: { fileName: 'ASC' },
    });

    return { folders, files };
  }

  // 16. Get Trashed Folder Contents (listing nested trashed files & folders)
  async getTrashedFolderContents(folderId: string, userId: string) {
    const currentFolder = await this.folderRepository.findOne({
      where: { id: folderId, userId, isTrashed: true },
    });
    if (!currentFolder) {
      throw new NotFoundException('Trashed folder not found');
    }

    const folders = await this.folderRepository.find({
      where: {
        userId,
        parentFolderId: folderId,
        isTrashed: true,
      },
      order: { name: 'ASC' },
    });

    const files = await this.filesRepository.find({
      where: {
        userId,
        folderId,
        isTrashed: true,
      },
      order: { createdAt: 'DESC' },
    });

    return { currentFolder, folders, files };
  }

  // 17. Get Trashed Folder Breadcrumbs (listing nested trashed parent chain)
  async getTrashedBreadcrumbs(folderId: string, userId: string): Promise<Folder[]> {
    const breadcrumbs: Folder[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = await this.folderRepository.findOne({
        where: { id: currentId, userId, isTrashed: true },
      });
      if (!folder) break;
      breadcrumbs.unshift(folder);
      currentId = folder.parentFolderId;
    }

    return breadcrumbs;
  }

  // 18. Move a single file to a target folder
  async moveFile(fileId: string, targetFolderId: string | null, userId: string) {
    const file = await this.getFileMetadata(fileId, userId, false);

    if (targetFolderId) {
      const targetFolder = await this.folderRepository.findOne({
        where: { id: targetFolderId, userId, isTrashed: false },
      });
      if (!targetFolder) {
        throw new NotFoundException('Target folder not found or is in trash');
      }
    }

    file.folderId = targetFolderId || null;
    await this.filesRepository.save(file);
    return { message: 'File moved successfully', file };
  }

  // 19. Move a folder to a target folder (with cyclic nesting safeguard)
  async moveFolder(folderId: string, targetFolderId: string | null, userId: string) {
    const folder = await this.folderRepository.findOne({
      where: { id: folderId, userId, isTrashed: false },
    });

    if (!folder) {
      throw new NotFoundException('Source folder not found');
    }

    if (targetFolderId === folderId) {
      throw new BadRequestException('Cannot move a folder into itself');
    }

    if (targetFolderId) {
      const targetFolder = await this.folderRepository.findOne({
        where: { id: targetFolderId, userId, isTrashed: false },
      });

      if (!targetFolder) {
        throw new NotFoundException('Target folder not found or is in trash');
      }

      // Check for cyclic nesting loop: trace targetFolder's parents up to root
      let checkId: string | null = targetFolder.parentFolderId;
      while (checkId) {
        if (checkId === folderId) {
          throw new BadRequestException('Cannot move a folder into one of its own subfolders');
        }
        const parent = await this.folderRepository.findOne({
          where: { id: checkId, userId },
        });
        checkId = parent ? parent.parentFolderId : null;
      }
    }

    folder.parentFolderId = targetFolderId || null;
    await this.folderRepository.save(folder);
    return { message: 'Folder moved successfully', folder };
  }
}
