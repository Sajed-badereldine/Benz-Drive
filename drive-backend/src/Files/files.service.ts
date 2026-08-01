import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, ILike } from 'typeorm';
import { Files, UploadStatus, FileType } from './entities/files.entity';
import { Folder } from './entities/folder.entity';
import { Share, ShareRole } from './entities/share.entity';
import { User } from '../users/entities/user.entity';
import { CreateFolderDto } from './dto/create-folder.dto';
import { ShareItemDto } from './dto/share-item.dto';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
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
    @InjectRepository(Share)
    private readonly shareRepository: Repository<Share>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
        ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN }),
      };
    }

    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.forcePathStyle = true;
    }

    this.s3Client = new S3Client(s3Config);
  }

  // Helper to calculate total user storage usage (includes active & trashed files)
  async getUserStorageUsage(userId: string): Promise<{ usedBytes: number; quotaBytes: number }> {
    const quotaBytes = 500 * 1024 * 1024; // 500 MB quota limit

    const usageResult = await this.filesRepository
      .createQueryBuilder('file')
      .select('SUM(file.sizeBytes)', 'sum')
      .where('file.userId = :userId', { userId })
      .andWhere('file.uploadStatus = :status', { status: UploadStatus.ACTIVE })
      .getRawOne();

    const usedBytes = parseInt(usageResult?.sum || '0', 10);
    return { usedBytes, quotaBytes };
  }

  // 1. Upload file to S3 and save metadata in DB
  async uploadFile(file: Express.Multer.File, userId: string, folderId: string | null = null): Promise<Files> {
    let ownerId = userId;

    if (folderId && folderId !== 'root') {
      const folderPerm = await this.getUserPermission('folder', folderId, userId);
      if (!folderPerm.isOwner && folderPerm.role !== 'EDITOR') {
        throw new ForbiddenException('You do not have permission to upload into this folder');
      }
      ownerId = folderPerm.item.userId;
    }

    // Enforce 500 MB total owner storage quota
    const { usedBytes, quotaBytes } = await this.getUserStorageUsage(ownerId);

    if (usedBytes + file.size > quotaBytes) {
      throw new BadRequestException(
        ownerId === userId
          ? 'You have exceeded your total storage limit of 500 MB. Please free up space.'
          : 'The folder owner has exceeded their storage quota limit.'
      );
    }

    const fileId = crypto.randomUUID();
    const s3Key = `${ownerId}/${fileId}-${file.originalname}`;

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
        userId: ownerId,
        folderId: folderId && folderId !== 'root' ? folderId : null,
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
    let ownerId = userId;

    if (folderId && folderId !== 'root') {
      const folderPerm = await this.getUserPermission('folder', folderId, userId);
      if (!folderPerm.isOwner && folderPerm.role !== 'EDITOR') {
        throw new ForbiddenException('You do not have permission to upload into this folder');
      }
      ownerId = folderPerm.item.userId;
    }

    // Enforce total owner storage quota (includes active & trashed files)
    const { usedBytes, quotaBytes } = await this.getUserStorageUsage(ownerId);

    if (usedBytes + fileSize > quotaBytes) {
      throw new BadRequestException(
        ownerId === userId
          ? 'You have exceeded your total storage limit of 500 MB. Please free up space.'
          : 'The folder owner has exceeded their storage quota limit.'
      );
    }

    const fileId = crypto.randomUUID();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `${ownerId}/${fileId}-${safeFileName}`;

    // Create a pending file metadata record in DB assigned to the folder owner
    const fileMetadata = this.filesRepository.create({
      id: fileId,
      fileName: fileName,
      s3Key: s3Key,
      userId: ownerId,
      folderId: folderId && folderId !== 'root' ? folderId : null,
      sizeBytes: fileSize,
      fileType: this.getFileType(mimeType),
      uploadStatus: UploadStatus.PENDING,
    });

    await this.filesRepository.save(fileMetadata);

    // Prepare S3 PutObjectCommand to generate signed URL
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
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

    // Allow owner or collaborator with permission to confirm upload
    const perm = await this.getUserPermission('file', fileId, userId);
    if (!perm.isOwner && perm.role !== 'EDITOR') {
      throw new ForbiddenException('You do not have permission to confirm this upload');
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

  // 3. Get file metadata (with owner & collaborator access validation)
  async getFileMetadata(fileId: string, userId: string, includeTrashed = false): Promise<Files> {
    const perm = await this.getUserPermission('file', fileId, userId);

    if (!perm.isOwner && !perm.role) {
      throw new ForbiddenException('You do not have permission to access this file');
    }

    const file = perm.item as Files;

    if (!includeTrashed && file.isTrashed) {
      throw new BadRequestException('File is in the trash bin');
    }

    return file;
  }

  // 4. Download file from S3 (returns a readable stream)
  async getFileStream(fileId: string, userId: string) {
    const file = await this.getFileMetadata(fileId, userId);

    // Update lastAccessedAt for recency tracking
    file.lastAccessedAt = new Date();
    await this.filesRepository.save(file);

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
    let folderOwnerId = userId;

    // If parentFolderId is provided, verify user is owner or editor
    if (parentFolderId && parentFolderId !== 'root') {
      const parentPerm = await this.getUserPermission('folder', parentFolderId, userId);
      if (!parentPerm.isOwner && parentPerm.role !== 'EDITOR') {
        throw new ForbiddenException('You do not have permission to create a folder here');
      }
      folderOwnerId = parentPerm.item.userId;
    }

    const folder = this.folderRepository.create({
      name,
      userId: folderOwnerId,
      parentFolderId: parentFolderId && parentFolderId !== 'root' ? parentFolderId : null,
    });

    return await this.folderRepository.save(folder);
  }

  // 6.5 Ensure Nested Folder Tree (Recursively creates or gets folder IDs for path segments)
  async ensureFolderTree(
    pathSegments: string[],
    startParentId: string | null,
    userId: string,
  ): Promise<{ folderId: string | null }> {
    let currentParentId: string | null = !startParentId || startParentId === 'root' ? null : startParentId;

    for (const segment of pathSegments) {
      if (!segment || !segment.trim()) continue;

      const cleanSegment = segment.trim();

      // Check if non-trashed folder already exists under currentParentId
      let folder = await this.folderRepository.findOne({
        where: {
          name: cleanSegment,
          parentFolderId: currentParentId === null ? IsNull() : currentParentId,
          isTrashed: false,
        },
      });

      // If it doesn't exist, create it
      if (!folder) {
        folder = await this.createFolder({ name: cleanSegment, parentFolderId: currentParentId || undefined }, userId);
      }

      currentParentId = folder.id;
    }

    return { folderId: currentParentId };
  }

  // 7. Get Folder Contents (Unified listing for files & subfolders)
  async getFolderContents(folderId: string | null, userId: string) {
    let currentFolder: Folder | null = null;
    const isRoot = !folderId || folderId === 'root';
    let isOwnerOrEditor = true;
    let folderOwnerId = userId;

    if (!isRoot) {
      const folderPerm = await this.getUserPermission('folder', folderId!, userId);
      if (!folderPerm.isOwner && !folderPerm.role) {
        throw new NotFoundException('Folder not found');
      }
      currentFolder = folderPerm.item as Folder;
      folderOwnerId = currentFolder.userId;
      isOwnerOrEditor = folderPerm.isOwner || folderPerm.role === 'EDITOR';
    }

    // Fetch folders in this directory
    const folders = await this.folderRepository.find({
      where: {
        userId: folderOwnerId,
        parentFolderId: isRoot ? IsNull() : folderId,
        isTrashed: false,
      },
      order: { name: 'ASC' },
    });

    // Fetch files in this directory
    const files = await this.filesRepository.find({
      where: {
        userId: folderOwnerId,
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
      canEdit: isOwnerOrEditor,
    };
  }

  // 8. Get Breadcrumbs
  async getBreadcrumbs(folderId: string, userId: string): Promise<Folder[]> {
    const breadcrumbs: Folder[] = [];
    let currentId: string | null = folderId;

    while (currentId && currentId !== 'root') {
      const perm = await this.getUserPermission('folder', currentId, userId);
      if (!perm.isOwner && !perm.role) break;
      const folder = perm.item as Folder;
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

  // 20. Toggle star on a file
  async toggleStarFile(fileId: string, userId: string) {
    const file = await this.filesRepository.findOne({ where: { id: fileId, userId } });
    if (!file) throw new NotFoundException('File not found');
    file.isStarred = !file.isStarred;
    await this.filesRepository.save(file);
    return { message: file.isStarred ? 'File starred' : 'File unstarred', isStarred: file.isStarred, file };
  }

  // 21. Toggle star on a folder
  async toggleStarFolder(folderId: string, userId: string) {
    const folder = await this.folderRepository.findOne({ where: { id: folderId, userId } });
    if (!folder) throw new NotFoundException('Folder not found');
    folder.isStarred = !folder.isStarred;
    await this.folderRepository.save(folder);
    return { message: folder.isStarred ? 'Folder starred' : 'Folder unstarred', isStarred: folder.isStarred, folder };
  }

  // 22. Get all starred items for user
  async getStarredItems(userId: string) {
    const folders = await this.folderRepository.find({
      where: { userId, isTrashed: false, isStarred: true },
      order: { updatedAt: 'DESC' },
    });
    const files = await this.filesRepository.find({
      where: { userId, isTrashed: false, uploadStatus: UploadStatus.ACTIVE, isStarred: true },
      order: { updatedAt: 'DESC' },
    });
    return { folders, files };
  }

  // 23. Get recent files for user
  async getRecentFiles(userId: string) {
    const files = await this.filesRepository.find({
      where: { userId, isTrashed: false, uploadStatus: UploadStatus.ACTIVE },
      order: { lastAccessedAt: 'DESC', updatedAt: 'DESC' },
      take: 50,
    });
    return files;
  }

  // 24. Duplicate a file (Make a copy)
  async duplicateFile(fileId: string, userId: string) {
    const original = await this.filesRepository.findOne({
      where: { id: fileId, userId, isTrashed: false, uploadStatus: UploadStatus.ACTIVE },
    });
    if (!original) throw new NotFoundException('Original file not found');

    // Verify storage quota
    const { usedBytes, quotaBytes } = await this.getUserStorageUsage(userId);
    if (usedBytes + original.sizeBytes > quotaBytes) {
      throw new BadRequestException('Cannot copy file. Storage limit of 500 MB exceeded.');
    }

    const newFileId = crypto.randomUUID();
    const ext = original.fileName.includes('.') ? original.fileName.split('.').pop() : '';
    const nameWithoutExt = ext ? original.fileName.substring(0, original.fileName.lastIndexOf('.')) : original.fileName;
    const newFileName = `Copy of ${nameWithoutExt}${ext ? '.' + ext : ''}`;
    const newS3Key = `${userId}/${newFileId}-${newFileName}`;

    // S3 Copy Object
    await this.s3Client.send(
      new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${original.s3Key}`,
        Key: newS3Key,
      })
    );

    const duplicate = this.filesRepository.create({
      id: newFileId,
      fileName: newFileName,
      s3Key: newS3Key,
      userId,
      folderId: original.folderId,
      sizeBytes: original.sizeBytes,
      fileType: original.fileType,
      uploadStatus: UploadStatus.ACTIVE,
      isStarred: original.isStarred,
      lastAccessedAt: new Date(),
    });

    await this.filesRepository.save(duplicate);
    return { message: 'File copied successfully', file: duplicate };
  }

  // ----------------------------------------------------
  // SHARING & OBJECT-LEVEL AUTHORIZATION METHODS
  // ----------------------------------------------------

  // Check user permission on an item (handles ownership + direct shares + parent folder inheritance)
  async getUserPermission(
    itemType: 'file' | 'folder',
    itemId: string,
    userId: string,
  ): Promise<{ isOwner: boolean; role: 'OWNER' | 'VIEWER' | 'EDITOR' | null; item: any }> {
    if (itemType === 'file') {
      const file = await this.filesRepository.findOne({ where: { id: itemId } });
      if (!file) throw new NotFoundException('File not found');

      if (file.userId === userId) {
        return { isOwner: true, role: 'OWNER', item: file };
      }

      // Check direct share
      const directShare = await this.shareRepository.findOne({
        where: { fileId: itemId, granteeId: userId },
      });
      if (directShare) {
        return { isOwner: false, role: directShare.role as any, item: file };
      }

      // Check inherited share via parent folder chain
      let currentFolderId = file.folderId;
      while (currentFolderId) {
        const folderShare = await this.shareRepository.findOne({
          where: { folderId: currentFolderId, granteeId: userId },
        });
        if (folderShare) {
          return { isOwner: false, role: folderShare.role as any, item: file };
        }

        const parentFolder = await this.folderRepository.findOne({ where: { id: currentFolderId } });
        currentFolderId = parentFolder?.parentFolderId || null;
      }

      return { isOwner: false, role: null, item: file };
    } else {
      const folder = await this.folderRepository.findOne({ where: { id: itemId } });
      if (!folder) throw new NotFoundException('Folder not found');

      if (folder.userId === userId) {
        return { isOwner: true, role: 'OWNER', item: folder };
      }

      // Check direct share
      const directShare = await this.shareRepository.findOne({
        where: { folderId: itemId, granteeId: userId },
      });
      if (directShare) {
        return { isOwner: false, role: directShare.role as any, item: folder };
      }

      // Check inherited share via parent folder chain
      let currentFolderId = folder.parentFolderId;
      while (currentFolderId) {
        const parentShare = await this.shareRepository.findOne({
          where: { folderId: currentFolderId, granteeId: userId },
        });
        if (parentShare) {
          return { isOwner: false, role: parentShare.role as any, item: folder };
        }

        const parentFolder = await this.folderRepository.findOne({ where: { id: currentFolderId } });
        currentFolderId = parentFolder?.parentFolderId || null;
      }

      return { isOwner: false, role: null, item: folder };
    }
  }

  // Share an item with a user by email
  async shareItem(shareDto: ShareItemDto, ownerId: string) {
    const { itemId, itemType, email, role = ShareRole.VIEWER } = shareDto;

    const perm = await this.getUserPermission(itemType, itemId, ownerId);
    if (!perm.isOwner) {
      throw new ForbiddenException('Only the owner can manage sharing permissions for this item');
    }

    const grantee = await this.userRepository.findOne({ where: { email: email.toLowerCase().trim() } });
    if (!grantee) {
      throw new NotFoundException(`No registered user found with email: ${email}`);
    }

    if (grantee.id === ownerId) {
      throw new BadRequestException('You cannot share an item with yourself');
    }

    let share = await this.shareRepository.findOne({
      where: itemType === 'file'
        ? { fileId: itemId, granteeId: grantee.id }
        : { folderId: itemId, granteeId: grantee.id },
    });

    if (share) {
      share.role = role;
    } else {
      share = this.shareRepository.create({
        ownerId,
        granteeId: grantee.id,
        fileId: itemType === 'file' ? itemId : null,
        folderId: itemType === 'folder' ? itemId : null,
        role,
      });
    }

    await this.shareRepository.save(share);
    return { message: `Successfully shared with ${grantee.email}`, share };
  }

  // Get all active shares for a file/folder
  async getItemShares(itemType: 'file' | 'folder', itemId: string, ownerId: string) {
    const perm = await this.getUserPermission(itemType, itemId, ownerId);
    if (!perm.isOwner && perm.role !== 'EDITOR') {
      throw new ForbiddenException('You do not have permission to view sharing options for this item');
    }

    const shares = await this.shareRepository.find({
      where: itemType === 'file' ? { fileId: itemId } : { folderId: itemId },
      relations: { grantee: true, owner: true },
    });

    // Filter out null grantee link records so anonymous/blank users are never listed
    return shares
      .filter((s) => s.granteeId !== null)
      .map((s) => ({
        id: s.id,
        role: s.role,
        shareToken: s.shareToken,
        createdAt: s.createdAt,
        grantee: s.grantee
          ? { id: s.grantee.id, username: s.grantee.username, email: s.grantee.email }
          : null,
        owner: { id: s.owner.id, username: s.owner.username, email: s.owner.email },
      }));
  }

  // Update a collaborator's role
  async updateShareRole(shareId: string, role: ShareRole, ownerId: string) {
    const share = await this.shareRepository.findOne({ where: { id: shareId, ownerId } });
    if (!share) {
      throw new NotFoundException('Share record not found or you are not the owner');
    }

    share.role = role;
    await this.shareRepository.save(share);
    return { message: 'Permissions updated successfully', share };
  }

  // Revoke a share
  async revokeShare(shareId: string, ownerId: string) {
    const share = await this.shareRepository.findOne({ where: { id: shareId, ownerId } });
    if (!share) {
      throw new NotFoundException('Share record not found or you are not the owner');
    }

    await this.shareRepository.remove(share);
    return { message: 'Access revoked successfully' };
  }

  // Get items shared with the logged in user
  async getSharedWithMe(granteeId: string) {
    const shares = await this.shareRepository.find({
      where: { granteeId },
      relations: { file: true, folder: true, owner: true },
      order: { createdAt: 'DESC' },
    });

    const fileMap = new Map();
    shares
      .filter((s) => s.file && !s.file.isTrashed && s.file.uploadStatus === UploadStatus.ACTIVE)
      .forEach((s) => {
        if (!fileMap.has(s.file!.id)) {
          fileMap.set(s.file!.id, {
            ...s.file,
            shareRole: s.role,
            sharedBy: { id: s.owner.id, username: s.owner.username, email: s.owner.email },
          });
        }
      });

    const folderMap = new Map();
    shares
      .filter((s) => s.folder && !s.folder.isTrashed)
      .forEach((s) => {
        if (!folderMap.has(s.folder!.id)) {
          folderMap.set(s.folder!.id, {
            ...s.folder,
            shareRole: s.role,
            sharedBy: { id: s.owner.id, username: s.owner.username, email: s.owner.email },
          });
        }
      });

    return { files: Array.from(fileMap.values()), folders: Array.from(folderMap.values()) };
  }

  // Create or retrieve share link record & token
  async createShareLink(itemType: 'file' | 'folder', itemId: string, ownerId: string) {
    const perm = await this.getUserPermission(itemType, itemId, ownerId);
    if (!perm.isOwner && perm.role !== 'EDITOR') {
      throw new ForbiddenException('Only owners and editors can manage share links');
    }

    let share = await this.shareRepository.findOne({
      where: itemType === 'file'
        ? { fileId: itemId, granteeId: IsNull() }
        : { folderId: itemId, granteeId: IsNull() },
    });

    if (!share) {
      const shareToken = crypto.randomBytes(16).toString('hex');
      share = this.shareRepository.create({
        ownerId,
        fileId: itemType === 'file' ? itemId : null,
        folderId: itemType === 'folder' ? itemId : null,
        role: ShareRole.VIEWER,
        shareToken,
        isPublicLinkEnabled: false, // Default: Restricted
      });
      await this.shareRepository.save(share);
    }

    return {
      shareToken: share.shareToken,
      linkUrl: `/share/${share.shareToken}`,
      isPublicLinkEnabled: share.isPublicLinkEnabled,
    };
  }

  // Update General Access setting (Restricted vs Anyone with the link)
  async updateLinkAccess(itemType: 'file' | 'folder', itemId: string, isPublicLinkEnabled: boolean, ownerId: string) {
    const perm = await this.getUserPermission(itemType, itemId, ownerId);
    if (!perm.isOwner && perm.role !== 'EDITOR') {
      throw new ForbiddenException('Only owners and editors can change link access settings');
    }

    let share = await this.shareRepository.findOne({
      where: itemType === 'file'
        ? { fileId: itemId, granteeId: IsNull() }
        : { folderId: itemId, granteeId: IsNull() },
    });

    if (!share) {
      const shareToken = crypto.randomBytes(16).toString('hex');
      share = this.shareRepository.create({
        ownerId,
        fileId: itemType === 'file' ? itemId : null,
        folderId: itemType === 'folder' ? itemId : null,
        role: ShareRole.VIEWER,
        shareToken,
        isPublicLinkEnabled,
      });
    } else {
      share.isPublicLinkEnabled = isPublicLinkEnabled;
    }

    await this.shareRepository.save(share);
    return {
      message: `General access updated to ${isPublicLinkEnabled ? 'Anyone with the link' : 'Restricted'}`,
      isPublicLinkEnabled: share.isPublicLinkEnabled,
    };
  }

  // Access an item via link token (checks permissions or public access)
  async accessShareLink(shareToken: string, granteeId: string) {
    const share = await this.shareRepository.findOne({
      where: { shareToken },
      relations: { file: true, folder: true },
    });

    if (!share) {
      throw new NotFoundException('Invalid or expired share link');
    }

    const itemType = share.fileId ? 'file' : 'folder';
    const itemId = (share.fileId || share.folderId)!;

    // Check user's permission on this item
    const userPerm = await this.getUserPermission(itemType, itemId, granteeId);

    // If user is NOT owner AND has no explicit share permission AND public link is DISABLED (Restricted)
    if (!userPerm.isOwner && !userPerm.role && !share.isPublicLinkEnabled) {
      throw new ForbiddenException('You need access. You do not have permission to view this item.');
    }

    // If public link is enabled and user doesn't have an explicit share record, grant viewer access
    if (!userPerm.isOwner && !userPerm.role && share.isPublicLinkEnabled) {
      const userShare = this.shareRepository.create({
        ownerId: share.ownerId,
        granteeId,
        fileId: share.fileId,
        folderId: share.folderId,
        role: share.role,
      });
      await this.shareRepository.save(userShare);
    }

    return {
      itemType,
      itemId,
      role: userPerm.role || share.role,
      file: share.file,
      folder: share.folder,
    };
  }
}
