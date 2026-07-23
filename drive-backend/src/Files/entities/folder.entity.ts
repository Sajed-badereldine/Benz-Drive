import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Files } from './files.entity';

@Entity('folders')
export class Folder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    userId: string;

    @Column({ type: 'varchar', nullable: true })
    parentFolderId: string | null;

    @Column({ default: false })
    isTrashed: boolean;

    @Column({ type: 'timestamp', nullable: true })
    trashedAt: Date | null;

    @Column({ default: false })
    isStarred: boolean;

    @Column({ type: 'timestamp', nullable: true })
    lastAccessedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    // Self-referential parent relation (Cascades delete down parent-to-child)
    @ManyToOne(() => Folder, (folder) => folder.subfolders, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'parentFolderId' })
    parentFolder: Folder | null;

    @OneToMany(() => Folder, (folder) => folder.parentFolder)
    subfolders: Folder[];

    @OneToMany(() => Files, (file) => file.folder)
    files: Files[];
}
