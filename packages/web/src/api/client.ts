import type {
  Run,
  RunResponse,
  CreateRunRequest,
  AgentArchetype,
  RunEvent,
  FrictionPoint,
} from '@dryrun/shared';

const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
}

export async function getArchetypes(): Promise<AgentArchetype[]> {
  const response = await fetch(`${API_BASE}/runs/archetypes`);
  return handleResponse(response);
}

export async function createRun(data: CreateRunRequest): Promise<Run> {
  const response = await fetch(`${API_BASE}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function getRuns(): Promise<Run[]> {
  const response = await fetch(`${API_BASE}/runs`);
  return handleResponse(response);
}

export async function getRun(id: string): Promise<RunResponse> {
  const response = await fetch(`${API_BASE}/runs/${id}`);
  return handleResponse(response);
}

export async function stopRun(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/runs/${id}/stop`, {
    method: 'POST',
  });
  await handleResponse(response);
}

// SSE stream for real-time updates
export interface RunStreamMessage {
  type: 'init' | 'event' | 'friction' | 'complete' | 'error';
  data?: unknown;
  run?: Run;
  events?: RunEvent[];
  frictionPoints?: FrictionPoint[];
}

export function subscribeToRun(
  id: string,
  onMessage: (msg: RunStreamMessage) => void,
  onError?: (error: Error) => void
): () => void {
  const eventSource = new EventSource(`${API_BASE}/runs/${id}/stream`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as RunStreamMessage;
      onMessage(data);
    } catch (err) {
      console.error('Failed to parse SSE message:', err);
    }
  };

  eventSource.onerror = () => {
    onError?.(new Error('Connection lost'));
    eventSource.close();
  };

  return () => eventSource.close();
}
