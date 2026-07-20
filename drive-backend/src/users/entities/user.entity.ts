import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from "typeorm";
import { Exclude } from "class-transformer";

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    username: string;

    @Column({ unique: true })
    email: string;

    @Column()
    @Exclude()
    password: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @DeleteDateColumn()
    deleted_at: Date;

    @Column({ default: false })
    isVerified: boolean;

    @Column({ type: 'varchar', nullable: true })
    @Exclude() // Make sure token is never serialized in response
    verificationToken: string | null;

    @Column({ type: 'timestamp', nullable: true })
    @Exclude()
    verificationTokenExpires: Date | null;

    @Column({ type: 'varchar', nullable: true })
    @Exclude()
    resetPasswordToken: string | null;

    @Column({ type: 'timestamp', nullable: true })
    @Exclude()
    resetPasswordExpires: Date | null;

    @Column({ default: false })
    isTwoFactorEnabled: boolean;

    @Column({ type: 'varchar', nullable: true })
    @Exclude()
    twoFactorCode: string | null;

    @Column({ type: 'timestamp', nullable: true })
    @Exclude()
    twoFactorCodeExpires: Date | null;

}