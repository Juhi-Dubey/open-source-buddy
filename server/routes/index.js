import { Router } from 'express';
import { config } from '../config.js';
import { explainRateLimit } from '../middleware/rateLimit.js';
import issues from './issues.js';
import health from './health.js';
import explain from './explain.js';
import explainStream from './explainStream.js';
import saved from './saved.js';

const router = Router();

// Only non-secret information is exposed here.
router.get('/status', (req, res) => {
  res.json({ githubMode: config.githubMode, aiProvider: config.aiProvider });
});

router.use('/issues', issues);
router.use('/repos', health);
router.use('/explain/stream', explainRateLimit, explainStream);
router.use('/explain', explainRateLimit, explain);
router.use('/saved', saved);

export default router;
