import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config(process.env.DOTENV_CONFIG_PATH ? { path: process.env.DOTENV_CONFIG_PATH } : undefined);

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  PORTAINER_URL: z.string().min(1, { message: 'PORTAINER_URL is required' }),
  PORTAINER_API_TOKEN: z.string().min(1, { message: 'PORTAINER_API_TOKEN is required' }),
  PORTAINER_ENDPOINT_ID: z.coerce.number({
    invalid_type_error: 'PORTAINER_ENDPOINT_ID must be a valid number',
    required_error: 'PORTAINER_ENDPOINT_ID is required'
  }),
  SQLITE_DB_PATH: z.string().default('./audit.db'),
  AWS_REGION: z.string().min(1, { message: 'AWS_REGION is required' }),
  BEDROCK_MODEL_ID: z.string().min(1, { message: 'BEDROCK_MODEL_ID is required' }),
  MCP_SERVER_PUBLIC_URL: z.string().min(1, { message: 'MCP_SERVER_PUBLIC_URL is required' }),
  OAUTH_CLIENT_ID: z.string().min(1, { message: 'OAUTH_CLIENT_ID is required' }),
  OAUTH_CLIENT_SECRET: z.string().min(1, { message: 'OAUTH_CLIENT_SECRET is required' }),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(3600),
  JWT_SIGNING_SECRET: z.string().min(1, { message: 'JWT_SIGNING_SECRET is required' })
});



/**
 * Parse and validate process.env against configSchema.
 * @returns {z.infer<typeof configSchema>}
 */
function loadConfig() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Configuration Validation Error — Missing or invalid environment variables: [${formattedErrors}]`);
  }
  return result.data;
}

/**
 * Validated application configuration object.
 */
export const config = loadConfig();
