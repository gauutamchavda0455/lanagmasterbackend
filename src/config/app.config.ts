import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.APP_PORT ?? '3000', 10),
  name: process.env.APP_NAME || 'my-backend',
  apiPrefix: process.env.API_PREFIX || 'api',
  env: process.env.APP_ENV || 'development',
}));
