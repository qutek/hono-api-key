import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

export const initDbConnect = (env: DrizzleD1Database) => drizzle(env, { schema });
