import { Router } from 'express';

const router = Router();

// Kiosk mode routes
router.post('/check-in', (_req, res) => {
  res.json({ message: 'Kiosk check-in - Coming soon in Phase 4', phase: 'Phase 4: Enterprise Capabilities' });
});

router.post('/check-out', (_req, res) => {
  res.json({ message: 'Kiosk check-out - Coming soon in Phase 4', phase: 'Phase 4: Enterprise Capabilities' });
});

router.get('/status', (_req, res) => {
  res.json({ message: 'Kiosk status - Coming soon in Phase 4', phase: 'Phase 4: Enterprise Capabilities' });
});

export default router;