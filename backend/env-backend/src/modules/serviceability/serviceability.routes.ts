import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';

export const serviceabilityRouter = Router();

const pin = z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode');

serviceabilityRouter.get('/serviceability/:pincode', async (req, res) => {
  const parsed = pin.safeParse(req.params.pincode);
  if (!parsed.success) {
    res.json({ serviceable: false, message: 'Enter a valid 6-digit pincode.' });
    return;
  }
  const row = await prisma.serviceablePincode.findUnique({ where: { pincode: parsed.data } });
  const ok = !!row?.isActive;
  res.json({ serviceable: ok, message: ok ? 'Delivery available to this pincode.' : 'Sorry, we do not deliver to this pincode yet.' });
});
