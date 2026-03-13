/** A topic / project "vertical" — the Kanban column that groups Threads. */
export interface Channel {
  id: string;
  name: string;
  icon: string;     // ionicons name
  color: string;    // Ionic color token
  description?: string;
}

/** Hardcoded default channels — can be persisted to a backend table later. */
export const DEFAULT_CHANNELS: Channel[] = [
  { id: 'inbox',    name: 'Inbox',    icon: 'mail-outline',        color: 'primary',   description: 'Unassigned threads'          },
  { id: 'code',     name: 'Code',     icon: 'code-slash-outline',  color: 'secondary', description: 'Development & debugging'     },
  { id: 'research', name: 'Research', icon: 'search-outline',      color: 'tertiary',  description: 'Deep dives & exploration'    },
  { id: 'ops',      name: 'Ops',      icon: 'server-outline',      color: 'warning',   description: 'Infrastructure & maintenance'},
  { id: 'family',   name: 'Family',   icon: 'home-outline',        color: 'success',   description: 'Personal & family tasks'    },
];
