import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) { }

    async findByEmail(email: string): Promise<User | null> {
        return this.userRepository.findOne({
            where: { email: email },
            select: {
                id: true,
                email: true,
                username: true,
                created_at: true,
                updated_at: true
            }
        })
    }

    async create(email: string, username: string, password: string) {
        const user = this.userRepository.create({
            email: email,
            username: username,
            password: password
        });
        return this.userRepository.save(user)
    }

    async findById(id: string) {
        return this.userRepository.findOne({
            where: { id: id },
            select: {
                id: true,
                email: true,
                username: true,
                created_at: true,
                updated_at: true
            }
        })
    }

    async deleteAccount(id: string) {
        return this.userRepository.softDelete({ id: id })
    }

}
