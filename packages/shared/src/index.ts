// Archetype Categories
export type ArchetypeCategory = 'general' | 'accessibility' | 'demographic' | 'contextual';

// Archetype Priorities (1-5 scale, weights friction severity)
export interface ArchetypePriorities {
  navigation: number;
  forms: number;
  contentClarity: number;
  visualDesign: number;
  performance: number;
  accessibility: number;
}

// Enhanced Constraints
export interface ArchetypeConstraints {
  maxFrictionPoints: number;
  readingStyle: 'skim' | 'thorough' | 'skip';
  patience: 'low' | 'medium' | 'high';
  viewport: { width: number; height: number };
  scrollBehavior: 'minimal' | 'normal' | 'thorough';
  typingSpeed: 'slow' | 'moderate' | 'fast';
  clickPrecision: 'low' | 'medium' | 'high';
  attentionSpan: 'short' | 'moderate' | 'extended';
  techLiteracy: 'low' | 'moderate' | 'high';
  inputMethod?: 'mouse' | 'touch' | 'keyboard';
}

// Agent Archetypes
export interface AgentArchetype {
  id: string;
  name: string;
  description: string;
  category: ArchetypeCategory;
  priorities: ArchetypePriorities;
  exampleFrictions: string[];
  constraints: ArchetypeConstraints;
  systemPrompt: string;
}

// Run types
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';

export interface Run {
  id: string;
  url: string;
  goal: string;
  archetypeId: string;
  archetypeName?: string; // Display name for the archetype
  status: RunStatus;
  createdAt: string;
  completedAt?: string;
  summary?: RunSummary;
}

// Recommendation Types
export type RecommendationType = 'quickWin' | 'majorChange' | 'contentFix' | 'bugFix' | 'enhancement';
export type RecommendationEffort = 'easy' | 'medium' | 'hard';

export interface Recommendation {
  title: string;
  description: string;
  type: RecommendationType;
  effort: RecommendationEffort;
  priority: number; // 1-5, based on severity × archetype priority
  category: FrictionCategory;
  element?: ElementReference;
  currentState?: string;
  suggestedState?: string;
  affectedArchetypes: string[];
  impactScore: number;
}

export interface RunSummary {
  stepsCompleted: number;
  goalReached: boolean;
  abandonReason?: string;
  frictionPointCount: number;
  recommendations: Recommendation[];
  // Keep legacy string recommendations for backward compatibility
  legacyRecommendations?: string[];
}

// Event types
export type EventType =
  | 'navigation'
  | 'click'
  | 'type'
  | 'scroll'
  | 'observation'
  | 'reasoning'
  | 'friction'
  | 'goal_reached'
  | 'abandoned'
  | 'error';

export interface RunEvent {
  id: string;
  runId: string;
  type: EventType;
  data: Record<string, unknown>;
  screenshotPath?: string;
  timestamp: string;
}

// Friction Categories
export type FrictionCategory =
  | 'navigation'
  | 'forms'
  | 'contentClarity'
  | 'visualDesign'
  | 'performance'
  | 'accessibility';

// Interaction Patterns (Auto-detected)
export type FrictionPattern =
  | 'repeatedClicks'
  | 'backtracking'
  | 'scrollHunting'
  | 'formAbandonment'
  | 'hesitation'
  | 'errorRecovery';

// Element Reference
export interface ElementReference {
  selector: string;
  visibleText?: string;
  elementType: string;
}

// Friction points
export type FrictionSeverity = 'low' | 'medium' | 'high';

export interface FrictionPoint {
  id: string;
  runId: string;
  description: string;
  severity: FrictionSeverity;
  category: FrictionCategory;
  pattern?: FrictionPattern;
  element?: ElementReference;
  heuristicViolation?: string;
  wcagViolation?: string;
  screenshotPath?: string;
  timestamp: string;
}

// Custom Archetype Input (simplified for quick custom)
export interface CustomArchetypeInput {
  name: string;
  description: string;
  // Key behavioral settings
  patience: 'low' | 'medium' | 'high';
  readingStyle: 'skim' | 'thorough' | 'skip';
  techLiteracy: 'low' | 'moderate' | 'high';
  // Device/viewport
  device: 'mobile' | 'tablet' | 'desktop';
  // Friction tolerance
  maxFrictionPoints: number; // 1-5
  // Optional focus areas (which categories matter most)
  focusAreas?: FrictionCategory[];
}

// Device type for viewport selection
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

// API Request/Response types
export interface CreateRunRequest {
  url: string;
  goal: string;
  // Either use a preset archetype OR a custom one
  archetypeId?: string;
  customArchetype?: CustomArchetypeInput;
  // Optional device override (for preset archetypes)
  device?: DeviceType;
}

export interface RunResponse {
  run: Run;
  events: RunEvent[];
  frictionPoints: FrictionPoint[];
}

// Page state for LLM
export interface PageElement {
  type: 'button' | 'link' | 'input' | 'text' | 'image' | 'form' | 'other';
  text: string;
  selector: string;
  attributes?: {
    href?: string;
    type?: string;
    name?: string;
    placeholder?: string;
    [key: string]: string | undefined;
  };
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PageState {
  url: string;
  title: string;
  elements: PageElement[];
  screenshot?: string; // base64
}

// Agent actions
export type AgentActionType = 'click' | 'type' | 'scroll' | 'navigate' | 'done' | 'stuck';

export interface AgentAction {
  type: AgentActionType;
  target?: string; // selector or URL
  value?: string; // for type action
  reasoning: string;
  frictionAssessment?: {
    detected: boolean;
    description?: string;
    severity?: FrictionSeverity;
    category?: FrictionCategory;
    pattern?: FrictionPattern;
    element?: ElementReference;
    heuristicViolation?: string;
    wcagViolation?: string;
  };
}

// LLM Decision
export interface LLMDecision {
  observation: string;
  reasoning: string;
  action: AgentAction;
}
