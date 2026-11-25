/**
 * The kinds of choice a user choice describes.
 *
 * Shared across owners — the `user-choices` collection's own `type` select and
 * the richEditor `ContentIndexBlock`'s `user-choices` filter — so it lives in
 * `src/lib/` per project-structure rule 4 rather than in the UserChoices
 * collection folder, as `pageTags` does for the same reason. One list means the
 * block cannot offer a kind the collection does not have.
 */
export const USER_CHOICE_TYPES: { label: string; value: string }[] = [
  { label: 'Mood', value: 'mood' },
  { label: 'Goal', value: 'goal' },
  { label: 'Duration', value: 'duration' },
]
