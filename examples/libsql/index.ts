import { serve } from '@hono/node-server';
import app from './src';

// Start Node server
serve(app);

console.group('Test in browser');
console.log('Test in browser:', `http://localhost:3000`);
console.log('Rate limit:', '10 requests per minute');
console.groupEnd();
