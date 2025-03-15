// backend/src/local.ts
// Local development server

import express from 'express';
import cors from 'cors';
import { Logger } from './utils/logger';
import config from './config';

const app = express();
const logger = new Logger('LocalServer');

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    params: req.params,
    query: req.query,
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API routes
app.use('/api/v1', (req, res) => {
  // This is a placeholder. Will be replaced with actual API routes.
  res.status(501).json({ 
    error: { 
      message: 'API routes not implemented yet',
      code: 'NOT_IMPLEMENTED'
    }
  });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
