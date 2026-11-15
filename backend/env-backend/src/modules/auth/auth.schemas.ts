import { z } from 'zod';
import { emailSchema, indianPhoneSchema, nameSchema, pincodeSchema } from './validators.js';

/** Any common way of writing an Indian mobile number; the value that reaches the handlers is always +91XXXXXXXXXX. */
export const phoneSchema = indianPhoneSchema;

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number');

export const signupSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  password: passwordSchema,
  consent: z.literal(true, { message: 'Please accept the terms to continue' }),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(128),
});

export const profileSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.nullish(),
});

export const addressSchema = z.object({
  label: z.enum(['Home', 'Office', 'Other']),
  name: nameSchema,
  phone: indianPhoneSchema,
  line1: z.string().trim().min(3).max(160),
  area: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().max(60).optional(),
  landmark: z.string().trim().max(120).optional(),
  pincode: pincodeSchema,
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  instructions: z.string().trim().max(240).optional(),
  isDefault: z.boolean().optional(),
}).refine((a) => (a.latitude == null) === (a.longitude == null), { message: 'Latitude and longitude must be provided together' });
