import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { subscribeToRun, stopRun, getRun, RunStreamMessage } from '../api/client';
import type { Run as RunType, RunEvent, FrictionPoint } from '@dryrun/shared';

export default function Run() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunType | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [frictionPoints, setFrictionPoints] = useState<FrictionPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [showScreenshot, setShowScreenshot] = useState(true);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;

    // First fetch current state
    getRun(id)
      .then((data) => {
        setRun(data.run);
        setEvents(data.events);
        setFrictionPoints(data.frictionPoints);

        // If already completed, redirect to report
        if (['completed', 'failed', 'stopped'].includes(data.run.status)) {
          navigate(`/report/${id}`);
          return;
        }
      })
      .catch((err) => setError(err.message));

    // Subscribe to updates
    const unsubscribe = subscribeToRun(
      id,
      (msg: RunStreamMessage) => {
        switch (msg.type) {
          case 'init':
            if (msg.run) setRun(msg.run);
            if (msg.events) setEvents(msg.events);
            if (msg.frictionPoints) setFrictionPoints(msg.frictionPoints);
            break;
          case 'event':
            if (msg.data) {
              setEvents((prev) => [...prev, msg.data as RunEvent]);
            }
            break;
          case 'friction':
            if (msg.data) {
              setFrictionPoints((prev) => [...prev, msg.data as FrictionPoint]);
            }
            break;
          case 'complete':
            if (msg.data) {
              setRun(msg.data as RunType);
              // Redirect to report after completion
              setTimeout(() => navigate(`/report/${id}`), 1000);
            }
            break;
          case 'error':
            setError((msg.data as { message: string })?.message || 'Unknown error');
            break;
        }
      },
      (err) => setError(err.message)
    );

    return () => unsubscribe();
  }, [id, navigate]);

  // Auto-scroll events
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const handleStop = async () => {
    if (!id) return;
    setStopping(true);
    try {
      await stopRun(id);
    } catch (err) {
      setError((err as Error).message);
    }
    setStopping(false);
  };

  const latestScreenshot = [...events]
    .reverse()
    .find((e) => e.screenshotPath)?.screenshotPath;

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-2 text-sm text-red-600 underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Test in Progress</h1>
          <p className="text-gray-600 text-sm mt-1 truncate max-w-md">{run.url}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
              {run.archetypeName || run.archetypeId}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <StatusIndicator status={run.status} />
          {run.status === 'running' && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {stopping ? 'Stopping...' : 'Stop Test'}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Screenshot */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">Live View</h2>
            <button
              onClick={() => setShowScreenshot(!showScreenshot)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              {showScreenshot ? (
                <>
                  <span>Hide</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                </>
              ) : (
                <>
                  <span>Show</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </>
              )}
            </button>
          </div>
          {showScreenshot ? (
            <div className="aspect-video bg-gray-100 flex items-center justify-center">
              {latestScreenshot ? (
                <img
                  src={latestScreenshot}
                  alt="Current page"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center">
                  <div className="animate-pulse text-4xl mb-2">📸</div>
                  <p className="text-gray-400">Waiting for screenshot...</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-400">
              <p>Screenshot hidden to reduce distraction</p>
              <p className="text-xs mt-1">Click "Show" to view live updates</p>
            </div>
          )}
        </div>

        {/* Event Log */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col max-h-[500px]">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">Action Log</h2>
            <span className="text-sm text-gray-500">{events.length} events</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-3"></div>
                <p className="text-gray-500 text-sm">Starting test...</p>
                <p className="text-gray-400 text-xs mt-1">The agent is loading the page</p>
              </div>
            ) : (
              events.map((event) => (
                <EventItem key={event.id} event={event} />
              ))
            )}
            <div ref={eventsEndRef} />
          </div>
        </div>
      </div>

      {/* Friction Points */}
      {frictionPoints.length > 0 && (
        <div className="mt-6 bg-yellow-50 rounded-xl border border-yellow-200 p-4">
          <h3 className="font-medium text-yellow-800 mb-2">
            Friction Points Detected ({frictionPoints.length})
          </h3>
          <div className="space-y-2">
            {frictionPoints.map((fp) => (
              <div key={fp.id} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 w-2 h-2 rounded-full ${
                    fp.severity === 'high'
                      ? 'bg-red-500'
                      : fp.severity === 'medium'
                        ? 'bg-yellow-500'
                        : 'bg-gray-400'
                  }`}
                />
                <p className="text-sm text-yellow-900">{fp.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Goal */}
      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          <span className="font-medium">Goal:</span> {run.goal}
        </p>
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-sm font-medium text-green-700">Running</span>
      </div>
    );
  }

  const styles: Record<string, { dot: string; text: string }> = {
    pending: { dot: 'bg-gray-400', text: 'text-gray-700' },
    completed: { dot: 'bg-green-500', text: 'text-green-700' },
    failed: { dot: 'bg-red-500', text: 'text-red-700' },
    stopped: { dot: 'bg-yellow-500', text: 'text-yellow-700' },
  };

  const style = styles[status] || styles.pending;

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${style.dot}`}></div>
      <span className={`text-sm font-medium ${style.text} capitalize`}>{status}</span>
    </div>
  );
}

function EventItem({ event }: { event: RunEvent }) {
  const icons: Record<string, string> = {
    navigation: '🧭',
    click: '👆',
    type: '⌨️',
    scroll: '📜',
    observation: '👁️',
    reasoning: '🧠',
    friction: '⚠️',
    goal_reached: '✅',
    abandoned: '🚫',
    error: '❌',
  };

  const data = event.data as Record<string, unknown>;

  const getMessage = () => {
    switch (event.type) {
      case 'navigation':
        return `Navigated to ${data.url}`;
      case 'click':
        return `Clicked: ${data.target}`;
      case 'type':
        return `Typed "${data.value}" into ${data.target}`;
      case 'scroll':
        return `Scrolled ${data.direction}`;
      case 'reasoning':
        return data.reasoning as string;
      case 'friction':
        return `Friction: ${data.description}`;
      case 'goal_reached':
        return 'Goal reached!';
      case 'abandoned':
        return `Abandoned: ${data.reason}`;
      case 'error':
        return `Error: ${data.message}`;
      default:
        return JSON.stringify(data);
    }
  };

  const isHighlight = ['friction', 'goal_reached', 'abandoned', 'error'].includes(
    event.type
  );

  return (
    <div
      className={`flex items-start gap-2 p-2 rounded text-sm ${
        isHighlight ? 'bg-gray-100' : ''
      }`}
    >
      <span className="flex-shrink-0">{icons[event.type] || '📌'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-gray-800 break-words">{getMessage()}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date(event.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
