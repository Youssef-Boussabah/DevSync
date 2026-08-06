import { z } from 'zod';
import { fileIdSchema, projectIdSchema } from './identifiers';
import { languageIdSchema } from './languages';

/**
 * What a client receives.
 *
 * These are wire resources, not storage records. The database hands back `Date`
 * objects and whatever columns exist; the API maps every property across
 * deliberately, so a column added for storage reasons cannot appear on the wire
 * by accident and a timestamp cannot arrive in whatever format a serialiser
 * happened to choose.
 */

/** A UTC instant, ISO-8601, with the `Z` designator. No local time, ever. */
export const utcTimestampSchema = z.iso.datetime();

export const projectResourceSchema = z.strictObject({
  id: projectIdSchema,
  name: z.string(),
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});

export type ProjectResource = z.infer<typeof projectResourceSchema>;

/** What `GET /projects` answers with: a bare array, with no envelope around it. */
export const projectListSchema = z.array(projectResourceSchema);

export type ProjectList = z.infer<typeof projectListSchema>;

/**
 * A file without its contents. Listing a project must not cost what the code in
 * it weighs, so summaries are what listings carry — and because the schema is
 * strict, a summary carrying `content` fails to parse rather than passing
 * unnoticed.
 */
export const projectFileSummaryResourceSchema = z.strictObject({
  id: fileIdSchema,
  projectId: projectIdSchema,
  name: z.string(),
  language: languageIdSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});

export type ProjectFileSummaryResource = z.infer<typeof projectFileSummaryResourceSchema>;

/** What `GET /projects/:projectId/files` answers with. */
export const projectFileSummaryListSchema = z.array(projectFileSummaryResourceSchema);

export type ProjectFileSummaryList = z.infer<typeof projectFileSummaryListSchema>;

/** One complete file. Empty content is content, so it is required, not optional. */
export const projectFileResourceSchema = projectFileSummaryResourceSchema.extend({
  content: z.string(),
});

export type ProjectFileResource = z.infer<typeof projectFileResourceSchema>;

/** One project and a summary of each file in it. Never their contents. */
export const projectDetailResourceSchema = projectResourceSchema.extend({
  files: z.array(projectFileSummaryResourceSchema),
});

export type ProjectDetailResource = z.infer<typeof projectDetailResourceSchema>;
