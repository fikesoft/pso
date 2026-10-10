import type { profileScope } from './profile-scope';

export type ProfileScope = Awaited<ReturnType<typeof profileScope>>;
