import { canWrite } from '../../config/access';

const CLIENT_SHARED_PATH = '/client-shared/';

export const shareLink = (origin, token) => (token ? `${origin}${CLIENT_SHARED_PATH}${token}` : null);

export const hiddenFromNames = (sharing, partId) => {
  const part = sharing?.parts?.find((p) => p.part_id === partId);
  if (!part) return [];
  const names = new Map(sharing.members.map((m) => [m.company_id, m.company_name]));
  return part.hidden_from.map((id) => names.get(id)).filter(Boolean);
};

export const canManageSharing = canWrite;
