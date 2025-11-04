import { z } from 'zod';

export const updateReservationSchema = z.object({
  title: z.string().min(1).optional(),
  purpose: z.string().optional(),
  equipment_id: z.number().int().positive().optional(),
  employee_id: z.number().int().positive().optional(),
  start_datetime: z.string().min(10).optional(),
  end_datetime: z.string().min(10).optional(),
  color: z.string().nullable().optional(),
});
