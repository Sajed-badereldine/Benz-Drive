import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsString, validateSync, Min, Max, IsNotEmpty, IsOptional } from 'class-validator';

enum Environment {
    Development = 'development',
    Production = 'production',
    Test = 'test',
}

class EnvironmentVariables {
    @IsEnum(Environment)
    NODE_ENV: Environment = Environment.Development;

    @IsString()
    @IsNotEmpty()
    DB_HOST: string;

    @IsNumber()
    @Min(0)
    @Max(65535)
    DB_PORT: number;

    @IsString()
    @IsNotEmpty()
    DB_USERNAME: string;

    @IsString()
    @IsNotEmpty()
    DB_PASSWORD: string;

    @IsString()
    @IsNotEmpty()
    DB_DATABASE: string;

    @IsString()
    @IsNotEmpty()
    JWT_SECRET: string;

    @IsString()
    @IsOptional()
    JWT_EXPIRES_IN?: string;

    @IsString()
    @IsNotEmpty()
    MAIL_HOST: string;

    @IsNumber()
    @Min(0)
    @Max(65535)
    MAIL_PORT: number;

    @IsString()
    @IsOptional()
    MAIL_USER?: string;

    @IsString()
    @IsOptional()
    MAIL_PASSWORD?: string;

    @IsString()
    @IsNotEmpty()
    MAIL_FROM: string;

    @IsString()
    @IsNotEmpty()
    AWS_REGION: string;

    @IsString()
    @IsOptional()
    AWS_ACCESS_KEY_ID?: string;

    @IsString()
    @IsOptional()
    AWS_SECRET_ACCESS_KEY?: string;

    @IsString()
    @IsNotEmpty()
    AWS_S3_BUCKET_NAME: string;

    @IsString()
    @IsOptional()
    AWS_S3_ENDPOINT?: string;

    @IsString()
    @IsNotEmpty()
    FRONTEND_URL: string;
}

export function validate(config: Record<string, any>) {
    const validatedConfig = plainToInstance(
        EnvironmentVariables,
        config,
        { enableImplicitConversion: true },
    );

    const errors = validateSync(validatedConfig, { skipMissingProperties: false });

    if (errors.length > 0) {
        throw new Error(`Environment validation failed: ${errors.toString()}`);
    }

    return validatedConfig;
}
