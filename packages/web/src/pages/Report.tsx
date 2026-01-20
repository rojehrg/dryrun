import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getRun, getArchetypes } from '../api/client';
import type { RunEvent, Recommendation, FrictionPoint, FrictionCategory } from '@dryrun/shared';

// Category display config
const categoryConfig: Record<
  FrictionCategory,
  { label: string; color: string; bgColor: string }
> = {
  navigation: { label: 'Navigation', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  forms: { label: 'Forms', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  contentClarity: { label: 'Content', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  visualDesign: { label: 'Design', color: 'text-pink-700', bgColor: 'bg-pink-100' },
  performance: { label: 'Performance', color: 'text-red-700', bgColor: 'bg-red-100' },
  accessibility: { label: 'Accessibility', color: 'text-teal-700', bgColor: 'bg-teal-100' },
};

// Effort badge styles
const effortConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  easy: { label: 'Easy', color: 'text-green-700', bgColor: 'bg-green-100' },
  medium: { label: 'Medium', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  hard: { label: 'Hard', color: 'text-red-700', bgColor: 'bg-red-100' },
};

// Recommendation type styles
const typeConfig: Record<string, { label: string; icon: string }> = {
  quickWin: { label: 'Quick Win', icon: '⚡' },
  majorChange: { label: 'Major Change', icon: '🔧' },
  contentFix: { label: 'Content Fix', icon: '📝' },
  bugFix: { label: 'Bug Fix', icon: '🐛' },
  enhancement: { label: 'Enhancement', icon: '✨' },
};

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [expandedRecommendation, setExpandedRecommendation] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['run', id],
    queryFn: () => getRun(id!),
    enabled: !!id,
  });

  const { data: archetypes } = useQuery({
    queryKey: ['archetypes'],
    queryFn: getArchetypes,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{(error as Error)?.message || 'Failed to load report'}</p>
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

  const { run, events, frictionPoints } = data;
  const archetype = archetypes?.find((a) => a.id === run.archetypeId);

  // If still running, redirect
  if (run.status === 'running') {
    navigate(`/run/${id}`);
    return null;
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const actionEvents = events.filter((e) =>
    ['navigation', 'click', 'type', 'scroll', 'goal_reached', 'abandoned'].includes(e.type)
  );

  // Check if recommendations are in new format (objects) or old format (strings)
  const recommendations = run.summary?.recommendations || [];
  const isNewFormat =
    recommendations.length > 0 && typeof recommendations[0] === 'object';

  // Group friction points by category
  const frictionByCategory = frictionPoints.reduce(
    (acc, fp) => {
      const category = fp.category || 'contentClarity';
      if (!acc[category]) acc[category] = [];
      acc[category].push(fp);
      return acc;
    },
    {} as Record<string, FrictionPoint[]>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link to="/" className="text-primary-600 hover:underline text-sm mb-2 inline-block">
          &larr; Back to tests
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Test Report</h1>
        <p className="text-gray-600 mt-1">{run.url}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <SummaryCard
          label="Status"
          value={run.summary?.goalReached ? 'Goal Reached' : 'Abandoned'}
          variant={run.summary?.goalReached ? 'success' : 'error'}
        />
        <SummaryCard
          label="Steps Taken"
          value={String(run.summary?.stepsCompleted || 0)}
          variant="neutral"
        />
        <SummaryCard
          label="Friction Points"
          value={String(frictionPoints.length)}
          variant={frictionPoints.length > 0 ? 'warning' : 'success'}
        />
        <SummaryCard
          label="Archetype"
          value={archetype?.name || run.archetypeId}
          variant="neutral"
          subtitle={archetype?.category}
        />
      </div>

      {/* Abandon Reason */}
      {run.summary?.abandonReason && (
        <div className="mb-8 bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-medium text-red-800 mb-1">Reason for Abandonment</h3>
          <p className="text-red-700">{run.summary.abandonReason}</p>
        </div>
      )}

      {/* Main Content */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Timeline */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-medium text-gray-900">Action Timeline</h2>
            </div>
            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {actionEvents.map((event, index) => (
                <TimelineItem
                  key={event.id}
                  event={event}
                  index={index + 1}
                  isSelected={event.id === selectedEventId}
                  hasFriction={frictionPoints.some(
                    (fp) =>
                      Math.abs(
                        new Date(fp.timestamp).getTime() - new Date(event.timestamp).getTime()
                      ) < 5000
                  )}
                  onClick={() =>
                    setSelectedEventId(event.id === selectedEventId ? null : event.id)
                  }
                />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Screenshot Preview */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="font-medium text-gray-900">Screenshot</h2>
            </div>
            <div className="aspect-video bg-gray-100 flex items-center justify-center">
              {selectedEvent?.screenshotPath ? (
                <img
                  src={selectedEvent.screenshotPath}
                  alt="Screenshot"
                  className="w-full h-full object-contain"
                />
              ) : (
                <p className="text-gray-400 text-sm">Select an action to view screenshot</p>
              )}
            </div>
          </div>

          {/* Friction Points - Enhanced with categories */}
          {frictionPoints.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-yellow-50">
                <h2 className="font-medium text-yellow-800">
                  Friction Points ({frictionPoints.length})
                </h2>
              </div>
              <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
                {Object.entries(frictionByCategory).map(([category, fps]) => (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${categoryConfig[category as FrictionCategory]?.bgColor || 'bg-gray-100'} ${categoryConfig[category as FrictionCategory]?.color || 'text-gray-700'}`}
                      >
                        {categoryConfig[category as FrictionCategory]?.label || category}
                      </span>
                      <span className="text-xs text-gray-400">({fps.length})</span>
                    </div>
                    {fps.map((fp) => (
                      <FrictionPointItem key={fp.id} friction={fp} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations Section - Enhanced */}
      {recommendations.length > 0 && (
        <div className="mt-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-primary-50">
              <h2 className="font-medium text-primary-800">
                Recommendations ({recommendations.length})
              </h2>
            </div>
            <div className="p-4">
              {isNewFormat ? (
                <div className="space-y-4">
                  {(recommendations as Recommendation[])
                    .sort((a, b) => b.priority - a.priority)
                    .map((rec, i) => (
                      <RecommendationCard
                        key={i}
                        recommendation={rec}
                        isExpanded={expandedRecommendation === i}
                        onToggle={() =>
                          setExpandedRecommendation(expandedRecommendation === i ? null : i)
                        }
                      />
                    ))}
                </div>
              ) : (
                <ul className="space-y-2">
                  {(recommendations as unknown as string[]).map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary-600 mt-0.5">•</span>
                      <p className="text-sm text-gray-700">{rec}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Goal */}
      <div className="mt-8 bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-600">
          <span className="font-medium">Goal:</span> {run.goal}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Started {new Date(run.createdAt).toLocaleString()}
          {run.completedAt && ` • Completed ${new Date(run.completedAt).toLocaleString()}`}
        </p>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  variant,
  subtitle,
}: {
  label: string;
  value: string;
  variant: 'success' | 'error' | 'warning' | 'neutral';
  subtitle?: string;
}) {
  const styles = {
    success: 'bg-green-50 border-green-200 text-green-700',
    error: 'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    neutral: 'bg-gray-50 border-gray-200 text-gray-700',
  };

  return (
    <div className={`rounded-lg border p-4 ${styles[variant]}`}>
      <p className="text-sm opacity-75">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
      {subtitle && <p className="text-xs opacity-60 mt-0.5 capitalize">{subtitle}</p>}
    </div>
  );
}

function FrictionPointItem({ friction }: { friction: FrictionPoint }) {
  return (
    <div className="ml-2 mb-3 last:mb-0">
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
            friction.severity === 'high'
              ? 'bg-red-500'
              : friction.severity === 'medium'
                ? 'bg-yellow-500'
                : 'bg-gray-400'
          }`}
        />
        <div className="flex-1">
          <p className="text-sm text-gray-800">{friction.description}</p>
          <div className="flex flex-wrap gap-2 mt-1">
            <span className="text-xs text-gray-500 capitalize">{friction.severity}</span>
            {friction.pattern && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                {formatPattern(friction.pattern)}
              </span>
            )}
          </div>
          {friction.heuristicViolation && (
            <p className="text-xs text-blue-600 mt-1">{friction.heuristicViolation}</p>
          )}
          {friction.wcagViolation && (
            <p className="text-xs text-teal-600 mt-1">{friction.wcagViolation}</p>
          )}
          {friction.element && (
            <p className="text-xs text-gray-400 mt-1 font-mono truncate">
              {friction.element.elementType}: {friction.element.visibleText || friction.element.selector}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RecommendationCard({
  recommendation,
  isExpanded,
  onToggle,
}: {
  recommendation: Recommendation;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const typeInfo = typeConfig[recommendation.type] || typeConfig.enhancement;
  const effortInfo = effortConfig[recommendation.effort] || effortConfig.medium;
  const categoryInfo =
    categoryConfig[recommendation.category] || categoryConfig.contentClarity;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{typeInfo.icon}</span>
              <h3 className="font-medium text-gray-900">{recommendation.title}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${categoryInfo.bgColor} ${categoryInfo.color}`}
              >
                {categoryInfo.label}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${effortInfo.bgColor} ${effortInfo.color}`}
              >
                {effortInfo.label}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {typeInfo.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PriorityBadge priority={recommendation.priority} />
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50">
          <p className="text-sm text-gray-700 mb-3">{recommendation.description}</p>

          {(recommendation.currentState || recommendation.suggestedState) && (
            <div className="grid gap-3 md:grid-cols-2 mb-3">
              {recommendation.currentState && (
                <div className="bg-red-50 rounded p-2">
                  <p className="text-xs font-medium text-red-700 mb-1">Current</p>
                  <p className="text-sm text-red-800">{recommendation.currentState}</p>
                </div>
              )}
              {recommendation.suggestedState && (
                <div className="bg-green-50 rounded p-2">
                  <p className="text-xs font-medium text-green-700 mb-1">Suggested</p>
                  <p className="text-sm text-green-800">{recommendation.suggestedState}</p>
                </div>
              )}
            </div>
          )}

          {recommendation.element && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1">Affected Element</p>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                {recommendation.element.selector}
              </code>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Impact Score: {recommendation.impactScore}/10</span>
            {recommendation.affectedArchetypes.length > 0 && (
              <span>
                Affects: {recommendation.affectedArchetypes.join(', ')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: number }) {
  const colors = {
    5: 'bg-red-500 text-white',
    4: 'bg-orange-500 text-white',
    3: 'bg-yellow-500 text-white',
    2: 'bg-blue-500 text-white',
    1: 'bg-gray-400 text-white',
  };

  return (
    <span
      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${colors[priority as keyof typeof colors] || colors[3]}`}
    >
      {priority}
    </span>
  );
}

function formatPattern(pattern: string): string {
  const patterns: Record<string, string> = {
    repeatedClicks: 'Repeated Clicks',
    backtracking: 'Backtracking',
    scrollHunting: 'Scroll Hunting',
    formAbandonment: 'Form Abandoned',
    hesitation: 'Hesitation',
    errorRecovery: 'Error Recovery',
  };
  return patterns[pattern] || pattern;
}

function TimelineItem({
  event,
  index,
  isSelected,
  hasFriction,
  onClick,
}: {
  event: RunEvent;
  index: number;
  isSelected: boolean;
  hasFriction: boolean;
  onClick: () => void;
}) {
  const data = event.data as Record<string, unknown>;

  const getMessage = () => {
    switch (event.type) {
      case 'navigation':
        return `Navigated to ${data.url}`;
      case 'click':
        return `Clicked "${data.target}"`;
      case 'type':
        return `Entered text into ${data.target}`;
      case 'scroll':
        return `Scrolled ${data.direction}`;
      case 'goal_reached':
        return 'Goal reached successfully';
      case 'abandoned':
        return `Abandoned: ${data.reason}`;
      default:
        return event.type;
    }
  };

  const getIcon = () => {
    switch (event.type) {
      case 'navigation':
        return '🧭';
      case 'click':
        return '👆';
      case 'type':
        return '⌨️';
      case 'scroll':
        return '📜';
      case 'goal_reached':
        return '✅';
      case 'abandoned':
        return '🚫';
      default:
        return '📌';
    }
  };

  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
        isSelected ? 'bg-primary-50' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs">
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span>{getIcon()}</span>
            <p className="text-sm text-gray-800 truncate">{getMessage()}</p>
            {hasFriction && (
              <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                Friction
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(event.timestamp).toLocaleTimeString()}
          </p>
        </div>
        {event.screenshotPath && (
          <div className="flex-shrink-0 w-16 h-10 bg-gray-100 rounded overflow-hidden">
            <img
              src={event.screenshotPath}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>
    </button>
  );
}
