import { z } from 'zod';
import { languageIdSchema } from './languages';

/**
 * What a client is allowed to send.
 *
 * Every request object is strict: an unrecognised property is an error rather
 * than something silently dropped, because a client sending `contents` when it
 * meant `content` should be told so instead of watching its edit disappear.
 *
 * Names are trimmed before they reach the database, and contents never are. A
 * trailing newline is part of a file; a trailing space is not part of a name.
 */

const projectNameSchema = z
  .string()
  .trim()
  .min(1, 'A project name is required.')
  .max(100, 'A project name may be at most 100 characters.');

const fileNameSchema = z
  .string()
  .trim()
  .min(1, 'A file name is required.')
  .max(255, 'A file name may be at most 255 characters.');

const fileContentSchema = z.string();

export const createProjectRequestSchema = z.strictObject({
  name: projectNameSchema,
});

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

/**
 * Renaming is the only change a project supports in Phase C, so this is a
 * required property rather than an open-ended partial object. `{}` is a request
 * that asks for nothing, and answering `200` to it would be a lie about what
 * happened.
 */
export const updateProjectRequestSchema = z.strictObject({
  name: projectNameSchema,
});

export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

export const createProjectFileRequestSchema = z.strictObject({
  name: fileNameSchema,
  language: languageIdSchema,
  // Omitted means empty, not absent. A file created without content is an empty
  // file, which is the same rule the editor already follows.
  content: fileContentSchema.default(''),
});

export type CreateProjectFileRequest = z.infer<typeof createProjectFileRequestSchema>;

/**
 * Any combination of the three, and never all three by obligation: saving a
 * keystroke should not have to restate the file's identity. A body carrying none
 * of them is rejected rather than treated as a write that changes nothing.
 */
export const updateProjectFileRequestSchema = z
  .strictObject({
    name: fileNameSchema.optional(),
    language: languageIdSchema.optional(),
    content: fileContentSchema.optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'Provide at least one of name, language, or content.',
  });

export type UpdateProjectFileRequest = z.infer<typeof updateProjectFileRequestSchema>;
