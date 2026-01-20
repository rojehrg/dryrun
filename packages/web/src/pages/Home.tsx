import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getArchetypes, createRun, getRuns } from '../api/client';
import type { CreateRunRequest, CustomArchetypeInput, FrictionCategory } from '@dryrun/shared';

const FOCUS_AREAS: { id: FrictionCategory; label: string; description: string }[] = [
  { id: 'navigation', label: 'Navigation', description: 'Finding where to go' },
  { id: 'forms', label: 'Forms', description: 'Form usability' },
  { id: 'contentClarity', label: 'Content', description: 'Clear instructions' },
  { id: 'visualDesign', label: 'Design', description: 'Visual layout' },
  { id: 'performance', label: 'Performance', description: 'Speed & responsiveness' },
  { id: 'accessibility', label: 'Accessibility', description: 'A11y compliance' },
];

const DEVICE_PRESETS = [
  { id: 'mobile', label: 'Mobile', icon: '📱', viewport: '390×844', description: 'iPhone 14 Pro' },
  { id: 'tablet', label: 'Tablet', icon: '📲', viewport: '1024×768', description: 'iPad' },
  { id: 'desktop', label: 'Desktop', icon: '🖥️', viewport: '1440×900', description: 'Laptop/Monitor' },
] as const;

export default function Home() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [goal, setGoal] = useState('');
  const [archetypeId, setArchetypeId] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  // Custom archetype form state
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customPatience, setCustomPatience] = useState<'low' | 'medium' | 'high'>('medium');
  const [customReadingStyle, setCustomReadingStyle] = useState<'skim' | 'thorough' | 'skip'>('skim');
  const [customTechLiteracy, setCustomTechLiteracy] = useState<'low' | 'moderate' | 'high'>('moderate');
  const [customDevice, setCustomDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [customMaxFriction, setCustomMaxFriction] = useState(3);
  const [customFocusAreas, setCustomFocusAreas] = useState<FrictionCategory[]>([]);

  const { data: archetypes, isLoading: archetypesLoading } = useQuery({
    queryKey: ['archetypes'],
    queryFn: getArchetypes,
  });

  const { data: runs } = useQuery({
    queryKey: ['runs'],
    queryFn: getRuns,
  });

  const createRunMutation = useMutation({
    mutationFn: (data: CreateRunRequest) => createRun(data),
    onSuccess: (run) => {
      navigate(`/run/${run.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !goal) return;

    if (isCustom) {
      if (!customName || !customDescription) return;

      const customArchetype: CustomArchetypeInput = {
        name: customName,
        description: customDescription,
        patience: customPatience,
        readingStyle: customReadingStyle,
        techLiteracy: customTechLiteracy,
        device: customDevice,
        maxFrictionPoints: customMaxFriction,
        focusAreas: customFocusAreas.length > 0 ? customFocusAreas : undefined,
      };

      createRunMutation.mutate({ url, goal, customArchetype });
    } else {
      if (!archetypeId) return;
      // Include device override for preset archetypes
      createRunMutation.mutate({ url, goal, archetypeId, device: selectedDevice });
    }
  };

  const handleArchetypeChange = (value: string) => {
    if (value === 'custom') {
      setIsCustom(true);
      setArchetypeId('');
    } else {
      setIsCustom(false);
      setArchetypeId(value);
    }
  };

  const toggleFocusArea = (area: FrictionCategory) => {
    setCustomFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const selectedArchetype = archetypes?.find((a) => a.id === archetypeId);
  const canSubmit = url && goal && (isCustom ? customName && customDescription : archetypeId);

  // Group archetypes by category for better organization
  const archetypesByCategory = archetypes?.reduce(
    (acc, arch) => {
      const cat = arch.category || 'general';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(arch);
      return acc;
    },
    {} as Record<string, typeof archetypes>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          AI-Powered UX Testing
        </h1>
        <p className="text-gray-600">
          Run AI agents through your product flows to discover friction points
          before your users do.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Test Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Start a New Test</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="url"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                URL to Test
              </label>
              <input
                type="url"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/signup"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>

            <div>
              <label
                htmlFor="goal"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Goal
              </label>
              <textarea
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Complete the signup flow as a new user"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>

            {/* Device Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Device
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DEVICE_PRESETS.map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => {
                      setSelectedDevice(device.id);
                      if (isCustom) setCustomDevice(device.id);
                    }}
                    className={`p-3 rounded-lg border-2 text-center transition-all ${
                      (isCustom ? customDevice : selectedDevice) === device.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl block mb-1">{device.icon}</span>
                    <span className="text-sm font-medium block">{device.label}</span>
                    <span className="text-xs text-gray-500">{device.viewport}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="archetype"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                User Archetype
              </label>
              <select
                id="archetype"
                value={isCustom ? 'custom' : archetypeId}
                onChange={(e) => handleArchetypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                disabled={archetypesLoading}
              >
                <option value="">Select an archetype...</option>
                {archetypesByCategory &&
                  Object.entries(archetypesByCategory).map(([category, archs]) => (
                    <optgroup key={category} label={category.charAt(0).toUpperCase() + category.slice(1)}>
                      {archs?.map((archetype) => (
                        <option key={archetype.id} value={archetype.id}>
                          {archetype.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                <optgroup label="Custom">
                  <option value="custom">+ Create Custom Archetype</option>
                </optgroup>
              </select>
            </div>

            {/* Preset Archetype Info */}
            {selectedArchetype && !isCustom && (
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                <p className="text-gray-700">{selectedArchetype.description}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-200 text-gray-700 text-xs">
                    {selectedArchetype.constraints.readingStyle} reader
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-200 text-gray-700 text-xs">
                    {selectedArchetype.constraints.patience} patience
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-200 text-gray-700 text-xs">
                    {selectedArchetype.constraints.viewport.width}x
                    {selectedArchetype.constraints.viewport.height}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary-100 text-primary-700 text-xs">
                    {selectedArchetype.category}
                  </span>
                </div>
              </div>
            )}

            {/* Custom Archetype Form */}
            {isCustom && (
              <div className="p-4 bg-primary-50 rounded-lg space-y-4 border border-primary-200">
                <h3 className="font-medium text-primary-900">Custom Archetype</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Persona Name
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g., Budget-Conscious Shopper"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    required={isCustom}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    placeholder="Describe who this user is and what they care about..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    required={isCustom}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Patience
                    </label>
                    <select
                      value={customPatience}
                      onChange={(e) => setCustomPatience(e.target.value as 'low' | 'medium' | 'high')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    >
                      <option value="low">Low - Easily frustrated</option>
                      <option value="medium">Medium - Moderate tolerance</option>
                      <option value="high">High - Very patient</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reading Style
                    </label>
                    <select
                      value={customReadingStyle}
                      onChange={(e) => setCustomReadingStyle(e.target.value as 'skim' | 'thorough' | 'skip')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    >
                      <option value="skim">Skim - Scans quickly</option>
                      <option value="thorough">Thorough - Reads everything</option>
                      <option value="skip">Skip - Ignores text</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tech Literacy
                    </label>
                    <select
                      value={customTechLiteracy}
                      onChange={(e) => setCustomTechLiteracy(e.target.value as 'low' | 'moderate' | 'high')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                    >
                      <option value="low">Low - Unfamiliar with tech</option>
                      <option value="moderate">Moderate - Basic comfort</option>
                      <option value="high">High - Tech-savvy</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Friction Tolerance: {customMaxFriction} point{customMaxFriction !== 1 ? 's' : ''}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={customMaxFriction}
                    onChange={(e) => setCustomMaxFriction(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Abandons quickly (1)</span>
                    <span>Very tolerant (5)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Focus Areas (optional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {FOCUS_AREAS.map((area) => (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => toggleFocusArea(area.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          customFocusAreas.includes(area.id)
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        title={area.description}
                      >
                        {area.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Issues in selected areas will be weighted more heavily
                  </p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={createRunMutation.isPending || !canSubmit}
              className="w-full py-2 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createRunMutation.isPending ? 'Starting...' : 'Run Test'}
            </button>

            {createRunMutation.isError && (
              <p className="text-red-600 text-sm">
                {createRunMutation.error.message}
              </p>
            )}
          </form>
        </div>

        {/* Recent Runs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Tests</h2>

          {runs && runs.length > 0 ? (
            <div className="space-y-3">
              {runs.slice(0, 5).map((run) => (
                <button
                  key={run.id}
                  onClick={() =>
                    navigate(
                      run.status === 'running'
                        ? `/run/${run.id}`
                        : `/report/${run.id}`
                    )
                  }
                  className="w-full p-3 text-left border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                      {run.url}
                    </span>
                    <StatusBadge status={run.status} />
                  </div>
                  <p className="text-xs text-gray-500 truncate">{run.goal}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-400">
                      {new Date(run.createdAt).toLocaleString()}
                    </p>
                    {run.archetypeId.startsWith('custom-') && (
                      <span className="text-xs px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded">
                        Custom
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No tests run yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    running: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    stopped: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.pending}`}
    >
      {status}
    </span>
  );
}
