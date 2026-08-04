/**
 * Injection token for the `Database` from `@devsync/database`.
 *
 * A token rather than a class, because what the package exports is an interface
 * built by a factory function — there is no constructor for Nest to inject.
 */
export const DATABASE = Symbol('DATABASE');
