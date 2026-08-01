import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Files } from './files.entity';
import { Folder } from './folder.entity';
import { User } from '../../users/entities/user.entity';

export enum ShareRole {
  VIEWER = 'VIEWER',
  EDITOR = 'EDITOR',
}

@Entity('shares')
export class Share {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column({ type: 'varchar', nullable: true })
  granteeId: string | null;

  @Column({ type: 'varchar', nullable: true })
  fileId: string | null;

  @Column({ type: 'varchar', nullable: true })
  folderId: string | null;

  @Column({
    type: 'enum',
    enum: ShareRole,
    default: ShareRole.VIEWER,
  })
  role: ShareRole;

  @Column({ type: 'varchar', nullable: true })
  shareToken: string | null;

  @Column({ default: false })
  isPublicLinkEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'granteeId' })
  grantee: User | null;

  @ManyToOne(() => Files, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'fileId' })
  file: Files | null;

  @ManyToOne(() => Folder, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'folderId' })
  folder: Folder | null;
}
