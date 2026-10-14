// DOCKER_SOCKET=off disables the container list (the demo does not read the host's containers)
const SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';

async function dockerApi<T = any>(path: string): Promise<T | null> {
  if (SOCKET === 'off') return null;
  try {
    const r = await fetch(`http://localhost${path}`, { unix: SOCKET });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch { return null; }
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  up: boolean;
  ports: string[];
  created: number;
  portainerUrl: string;
}

// Optional deep link to a container management UI, e.g. https://portainer.example.com/#!/2/docker/containers
const CONTAINER_UI_BASE = process.env.CONTAINER_UI_URL || '';

export async function listContainers(): Promise<{ list: DockerContainer[]; up: number; total: number }> {
  const containers = await dockerApi<any[]>('/containers/json?all=true');
  if (!containers) return { list: [], up: 0, total: 0 };
  const list = containers.map(c => {
    const name = (c.Names?.[0] || '').replace(/^\//, '');
    return {
      id: c.Id || '',
      name,
      image: c.Image || '',
      status: c.Status || '',
      state: c.State || '',
      up: c.State === 'running',
      ports: (c.Ports || []).map((p: any) =>
        p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`
      ),
      created: c.Created || 0,
      portainerUrl: CONTAINER_UI_BASE ? (c.Id ? `${CONTAINER_UI_BASE}/${c.Id}` : CONTAINER_UI_BASE) : '',
    };
  });
  list.sort((a, b) => {
    if (a.up !== b.up) return a.up ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { list, up: list.filter(c => c.up).length, total: list.length };
}
