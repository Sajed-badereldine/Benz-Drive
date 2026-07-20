import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Folder } from './folder.entity';

export enum UploadStatus {
    PENDING = 'pending',
    ACTIVE = 'active',
    FAILED = 'failed'
}

export enum FileType {
    IMAGE = 'image',
    VIDEO = 'video',
    AUDIO = 'audio',
    DOCUMENT = 'document',
    OTHER = 'other'
}

@Entity('files')
export class Files {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    fileName: string;

    @Column()
    s3Key: string;

    @Column()
    userId: string;

    @Column({ type: 'varchar', nullable: true })
    folderId: string | null;

    @Column({ default: 0 })
    sizeBytes: number;

    @Column({
        type: 'enum',
        enum: FileType,
        default: FileType.OTHER
    })
    fileType: FileType;

    @Column({
        type: 'enum',
        enum: UploadStatus,
        default: UploadStatus.PENDING
    })
    uploadStatus: UploadStatus;

    @Column({ default: false })
    isTrashed: boolean;

    @Column({ type: 'timestamp', nullable: true })
    trashedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    // Many files can belong to one folder (deleting folder cascades delete to database file records)
    @ManyToOne(() => Folder, (folder) => folder.files, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'folderId' })
    folder: Folder | null;
}
