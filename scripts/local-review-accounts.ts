// Disposable accounts for dev-local's isolated database only. Never import into the app/server.
export const localReviewPassword = 'TinyKarsLocal!2026';
export const localReviewAccounts = [
  {
    name: 'Local Super Admin',
    email: 'superadmin@tinykars.local',
    role: 'super_admin',
  },
  {
    name: 'Local Admin',
    email: 'admin@tinykars.local',
    role: 'admin',
  },
  {
    name: 'Local Delivery Staff',
    email: 'staff@tinykars.local',
    role: 'staff',
  },
] as const;
