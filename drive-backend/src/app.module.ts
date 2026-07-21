import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { FilesModule } from './Files/files.module'; // Import FilesModule
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'; // Import Throttler
import { APP_GUARD } from '@nestjs/core'; // Import APP_GUARD

import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import mailConfig from './config/mail.config'; // Import mailConfig
import awsConfig from './config/aws.config'; // Import awsConfig
import { validate } from './config/env.validation';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      load: [databaseConfig, jwtConfig, mailConfig, awsConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.database'),
        autoLoadEntities: true,
        synchronize: true,
        ssl: process.env.NODE_ENV === 'production' || process.env.DB_HOST?.includes('rds.amazonaws.com')
          ? { rejectUnauthorized: false }
          : false,
      }),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute in milliseconds
        limit: 20, // Limit each IP to 20 requests per minute
      },
    ]),
    UsersModule,
    AuthModule,
    FilesModule,
    MailModule, // Register FilesModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Apply rate limiting globally
    },
  ],
})
export class AppModule { }
