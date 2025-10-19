import Joi from 'joi';
import dotenv from 'dotenv';

dotenv.config();

interface EnvironmentVariables {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DB_PATH: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  ENCRYPTION_KEY: string;
  RATE_LIMIT_WINDOW: number;
  RATE_LIMIT_MAX: number;
  CORS_ORIGIN: string;
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
}

const envSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  
  PORT: Joi.number().default(3000),
  
  DB_PATH: Joi.string().default('./data/whatsapp.db'),
  
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  
  ENCRYPTION_KEY: Joi.string().length(64).required(),
  
  RATE_LIMIT_WINDOW: Joi.number().default(900000),
  RATE_LIMIT_MAX: Joi.number().default(100),
  
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
  
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
}).unknown();

const { error, value: env } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const config = {
  env: env.NODE_ENV as 'development' | 'test' | 'production',
  port: env.PORT as number,
  
  database: {
    path: env.DB_PATH as string,
  },
  
  jwt: {
    secret: env.JWT_SECRET as string,
    expiresIn: env.JWT_EXPIRES_IN as string,
  },
  
  encryption: {
    key: env.ENCRYPTION_KEY as string,
  },
  
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW as number,
    max: env.RATE_LIMIT_MAX as number,
  },
  
  cors: {
    origin: (env.CORS_ORIGIN as string).split(','),
  },
  
  logging: {
    level: env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug',
  },
};

export default config;