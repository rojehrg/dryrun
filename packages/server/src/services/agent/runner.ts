import { v4 as uuid } from 'uuid';
import type {
  Run,
  RunEvent,
  FrictionPoint,
  AgentArchetype,
  LLMDecision,
  FrictionPattern,
  FrictionCategory,
  Recommendation,
} from '@dryrun/shared';
import { BrowserService } from '../browser/index.js';
import { GeminiService } from '../llm/index.js';
import {
  createEvent,
  createFrictionPoint,
  updateRunStatus,
  updateRunSummary,
  getEventsByRunId,
  getFrictionPointsByRunId,
} from '../../db/index.js';
import { getScreenshotPath, getScreenshotUrl } from '../../utils/fs.js';
import { getArchetype } from './archetypes.js';

const MAX_STEPS = 50;
const STEP_DELAY_MS = 1000;

// Pattern detection thresholds
const REPEATED_CLICK_THRESHOLD = 2;
const BACKTRACK_WINDOW_EVENTS = 5;
const SCROLL_HUNT_THRESHOLD = 3;

export interface RunnerCallbacks {
  onEvent?: (event: RunEvent) => void;
  onFriction?: (friction: FrictionPoint) => void;
  onComplete?: (run: Run) => void;
}

// Interaction tracking for pattern detection
interface InteractionTracker {
  clickTargets: Map<string, number>; // target -> count
  navigationHistory: string[]; // URLs visited
  scrollCount: number;
  scrollDirection: 'up' | 'down' | null;
  lastFormField: string | null;
  formStarted: boolean;
}

export class AgentRunner {
  private browser: BrowserService;
  private llm: GeminiService;
  private isRunning = false;
  private shouldStop = false;
  private interactionTracker: InteractionTracker = this.createFreshTracker();

  constructor() {
    this.browser = new BrowserService();
    this.llm = new GeminiService();
  }

  private createFreshTracker(): InteractionTracker {
    return {
      clickTargets: new Map(),
      navigationHistory: [],
      scrollCount: 0,
      scrollDirection: null,
      lastFormField: null,
      formStarted: false,
    };
  }

  async run(run: Run, archetype: AgentArchetype, callbacks?: RunnerCallbacks): Promise<void> {
    if (this.isRunning) {
      throw new Error('Agent is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.interactionTracker = this.createFreshTracker();

    let frictionCount = 0;
    let stepCount = 0;
    let goalReached = false;
    let abandonReason: string | undefined;

    try {
      // Update status to running
      updateRunStatus(run.id, 'running');

      // Launch browser with archetype viewport
      await this.browser.launch(archetype.constraints.viewport);

      // Navigate to starting URL
      await this.browser.navigate(run.url);
      this.interactionTracker.navigationHistory.push(run.url);

      // Log initial navigation with screenshot
      const navEvent = await this.createEventWithScreenshot(run.id, 'navigation', { url: run.url });
      callbacks?.onEvent?.(navEvent);

      // Main agent loop
      while (stepCount < MAX_STEPS && !this.shouldStop) {
        stepCount++;

        // Get current page state
        const pageState = await this.browser.getPageState();
        const screenshotBase64 = await this.browser.captureScreenshotBase64();

        // Get action history
        const events = getEventsByRunId(run.id);

        // Ask LLM for next action
        let decision: LLMDecision;
        try {
          decision = await this.llm.decideNextAction(
            run.goal,
            archetype,
            pageState,
            events,
            screenshotBase64
          );
        } catch (error) {
          console.error('LLM error:', error);
          const errorEvent = this.createAndSaveEvent(run.id, 'error', {
            message: 'Failed to get LLM decision',
            error: String(error),
          });
          callbacks?.onEvent?.(errorEvent);
          break;
        }

        // Log reasoning
        const reasoningEvent = this.createAndSaveEvent(run.id, 'reasoning', {
          observation: decision.observation,
          reasoning: decision.reasoning,
        });
        callbacks?.onEvent?.(reasoningEvent);

        // Detect interaction patterns
        const detectedPattern = this.detectInteractionPattern(decision, events);

        // Check for friction
        if (decision.action.frictionAssessment?.detected) {
          frictionCount++;

          // Use detected pattern if LLM didn't provide one
          const pattern =
            decision.action.frictionAssessment.pattern || detectedPattern || undefined;

          // Calculate weighted severity based on archetype priorities
          const category = decision.action.frictionAssessment.category || 'contentClarity';
          const weightedSeverity = this.calculateWeightedSeverity(
            decision.action.frictionAssessment.severity || 'medium',
            category,
            archetype
          );

          const friction: FrictionPoint = {
            id: uuid(),
            runId: run.id,
            description: decision.action.frictionAssessment.description || 'Unspecified friction',
            severity: weightedSeverity,
            category: category,
            pattern: pattern,
            element: decision.action.frictionAssessment.element,
            heuristicViolation: decision.action.frictionAssessment.heuristicViolation,
            wcagViolation: decision.action.frictionAssessment.wcagViolation,
            timestamp: new Date().toISOString(),
          };

          // Capture screenshot for friction
          const frictionScreenshotPath = getScreenshotPath(run.id, friction.id);
          await this.browser.captureScreenshot(frictionScreenshotPath);
          friction.screenshotPath = getScreenshotUrl(run.id, friction.id);

          createFrictionPoint(friction);
          callbacks?.onFriction?.(friction);

          const frictionEvent = this.createAndSaveEvent(run.id, 'friction', {
            description: friction.description,
            severity: friction.severity,
            category: friction.category,
            pattern: friction.pattern,
            element: friction.element,
            heuristicViolation: friction.heuristicViolation,
            wcagViolation: friction.wcagViolation,
          });
          callbacks?.onEvent?.(frictionEvent);

          // Check if we should abandon
          if (frictionCount >= archetype.constraints.maxFrictionPoints) {
            abandonReason = `Too much friction (${frictionCount} points exceeded threshold of ${archetype.constraints.maxFrictionPoints})`;
            const abandonEvent = this.createAndSaveEvent(run.id, 'abandoned', {
              reason: abandonReason,
              frictionCount,
            });
            callbacks?.onEvent?.(abandonEvent);
            break;
          }
        }

        // Execute action
        const action = decision.action;

        if (action.type === 'done') {
          goalReached = true;
          const doneEvent = await this.createEventWithScreenshot(run.id, 'goal_reached', {
            reasoning: action.reasoning,
          });
          callbacks?.onEvent?.(doneEvent);
          break;
        }

        if (action.type === 'stuck') {
          abandonReason = action.reasoning || 'Agent got stuck';
          const stuckEvent = await this.createEventWithScreenshot(run.id, 'abandoned', {
            reason: abandonReason,
          });
          callbacks?.onEvent?.(stuckEvent);
          break;
        }

        // Execute the action
        try {
          await this.executeAction(action, run.id, callbacks);
        } catch (error) {
          console.error('Action execution error:', error);
          const errorEvent = this.createAndSaveEvent(run.id, 'error', {
            action: action.type,
            target: action.target,
            error: String(error),
          });
          callbacks?.onEvent?.(errorEvent);

          // Count execution errors as friction
          frictionCount++;
          if (frictionCount >= archetype.constraints.maxFrictionPoints) {
            abandonReason = 'Too many errors during execution';
            break;
          }
        }

        // Small delay between steps
        await this.delay(STEP_DELAY_MS);
      }

      if (stepCount >= MAX_STEPS && !goalReached) {
        abandonReason = `Maximum steps (${MAX_STEPS}) reached without completing goal`;
        const maxStepsEvent = this.createAndSaveEvent(run.id, 'abandoned', {
          reason: abandonReason,
          stepsCompleted: stepCount,
        });
        callbacks?.onEvent?.(maxStepsEvent);
      }
    } finally {
      // Clean up browser
      await this.browser.close();
      this.isRunning = false;

      // Generate summary and recommendations
      const events = getEventsByRunId(run.id);
      const frictionPoints = getFrictionPointsByRunId(run.id);

      let recommendations: Recommendation[] = [];
      try {
        recommendations = await this.llm.generateRecommendations(
          run.goal,
          archetype,
          events,
          frictionPoints
        );
      } catch (error) {
        console.error('Failed to generate recommendations:', error);
        recommendations = [
          {
            title: 'Unable to generate recommendations',
            description: 'An error occurred while generating recommendations.',
            type: 'enhancement',
            effort: 'medium',
            priority: 3,
            category: 'contentClarity',
            affectedArchetypes: [archetype.id],
            impactScore: 5,
          },
        ];
      }

      // Update run with summary
      const summary = {
        stepsCompleted: stepCount,
        goalReached,
        abandonReason,
        frictionPointCount: frictionCount,
        recommendations,
      };

      updateRunSummary(run.id, summary);
      updateRunStatus(
        run.id,
        this.shouldStop ? 'stopped' : goalReached ? 'completed' : 'failed',
        new Date().toISOString()
      );

      const updatedRun: Run = {
        ...run,
        status: this.shouldStop ? 'stopped' : goalReached ? 'completed' : 'failed',
        completedAt: new Date().toISOString(),
        summary,
      };

      callbacks?.onComplete?.(updatedRun);
    }
  }

  stop(): void {
    this.shouldStop = true;
  }

  /**
   * Detect interaction patterns based on action history
   */
  private detectInteractionPattern(
    decision: LLMDecision,
    events: RunEvent[]
  ): FrictionPattern | null {
    const action = decision.action;

    // Track clicks for repeatedClicks detection
    if (action.type === 'click' && action.target) {
      const currentCount = this.interactionTracker.clickTargets.get(action.target) || 0;
      this.interactionTracker.clickTargets.set(action.target, currentCount + 1);

      if (currentCount + 1 >= REPEATED_CLICK_THRESHOLD) {
        return 'repeatedClicks';
      }
    }

    // Track navigation for backtracking detection
    if (action.type === 'navigate' && action.target) {
      const history = this.interactionTracker.navigationHistory;
      if (history.includes(action.target)) {
        return 'backtracking';
      }
      history.push(action.target);
    }

    // Check for backtracking via recent navigation events
    const recentNavEvents = events
      .filter((e) => e.type === 'navigation')
      .slice(-BACKTRACK_WINDOW_EVENTS);

    if (recentNavEvents.length >= 2) {
      const urls = recentNavEvents.map((e) => (e.data as { url?: string }).url);
      const uniqueUrls = new Set(urls);
      if (uniqueUrls.size < urls.length) {
        return 'backtracking';
      }
    }

    // Track scrolling for scrollHunting detection
    if (action.type === 'scroll') {
      this.interactionTracker.scrollCount++;

      // Check for scroll direction changes (hunting behavior)
      const recentScrollEvents = events.filter((e) => e.type === 'scroll').slice(-5);
      const directions = recentScrollEvents.map((e) => (e.data as { direction?: string }).direction);

      let directionChanges = 0;
      for (let i = 1; i < directions.length; i++) {
        if (directions[i] !== directions[i - 1]) {
          directionChanges++;
        }
      }

      if (directionChanges >= 2 || this.interactionTracker.scrollCount >= SCROLL_HUNT_THRESHOLD) {
        return 'scrollHunting';
      }
    }

    // Track form interactions for formAbandonment
    if (action.type === 'type' && action.target) {
      this.interactionTracker.formStarted = true;
      this.interactionTracker.lastFormField = action.target;
    }

    // Check if navigating away from a form without completing
    if (
      (action.type === 'navigate' || action.type === 'click') &&
      this.interactionTracker.formStarted
    ) {
      // If clicking something that's not a submit button after starting a form
      if (action.target && !action.target.toLowerCase().includes('submit')) {
        const recentTypeEvents = events.filter((e) => e.type === 'type').slice(-3);
        if (recentTypeEvents.length > 0) {
          // Check if there was a form submission event
          const recentEvents = events.slice(-5);
          const hasFormSubmit = recentEvents.some(
            (e) =>
              e.type === 'click' &&
              ((e.data as { target?: string }).target?.toLowerCase().includes('submit') ||
                (e.data as { target?: string }).target?.toLowerCase().includes('continue') ||
                (e.data as { target?: string }).target?.toLowerCase().includes('next'))
          );

          if (!hasFormSubmit && action.type === 'navigate') {
            return 'formAbandonment';
          }
        }
      }
    }

    // Detect hesitation (multiple reasoning events without action)
    const recentReasoningEvents = events.filter((e) => e.type === 'reasoning').slice(-5);
    const recentActionEvents = events
      .filter((e) => ['click', 'type', 'navigate'].includes(e.type))
      .slice(-5);

    if (recentReasoningEvents.length > 3 && recentActionEvents.length < 2) {
      return 'hesitation';
    }

    // Detect error recovery (error followed by attempts to fix)
    const hasRecentError = events.slice(-3).some((e) => e.type === 'error');
    if (hasRecentError) {
      return 'errorRecovery';
    }

    return null;
  }

  /**
   * Calculate weighted severity based on archetype priorities
   */
  private calculateWeightedSeverity(
    baseSeverity: 'low' | 'medium' | 'high',
    category: FrictionCategory,
    archetype: AgentArchetype
  ): 'low' | 'medium' | 'high' {
    const severityValues = { low: 1, medium: 2, high: 3 };
    const baseValue = severityValues[baseSeverity];

    // Get the archetype's priority for this category (1-5 scale)
    const categoryPriority = archetype.priorities[category] || 3;

    // If priority is high (4-5), bump up severity
    // If priority is low (1-2), keep or reduce severity
    if (categoryPriority >= 4 && baseSeverity !== 'high') {
      return baseValue === 1 ? 'medium' : 'high';
    } else if (categoryPriority <= 2 && baseSeverity !== 'low') {
      return baseValue === 3 ? 'medium' : 'low';
    }

    return baseSeverity;
  }

  private async executeAction(
    action: LLMDecision['action'],
    runId: string,
    callbacks?: RunnerCallbacks
  ): Promise<void> {
    switch (action.type) {
      case 'click': {
        if (!action.target) throw new Error('Click action requires target');
        await this.browser.click(action.target);
        const event = await this.createEventWithScreenshot(runId, 'click', {
          target: action.target,
          reasoning: action.reasoning,
        });
        callbacks?.onEvent?.(event);
        break;
      }

      case 'type': {
        if (!action.target || !action.value) throw new Error('Type action requires target and value');
        await this.browser.type(action.target, action.value);
        const event = await this.createEventWithScreenshot(runId, 'type', {
          target: action.target,
          value: action.value,
          reasoning: action.reasoning,
        });
        callbacks?.onEvent?.(event);
        break;
      }

      case 'scroll': {
        await this.browser.scroll('down');
        const event = await this.createEventWithScreenshot(runId, 'scroll', {
          direction: 'down',
          reasoning: action.reasoning,
        });
        callbacks?.onEvent?.(event);
        break;
      }

      case 'navigate': {
        if (!action.target) throw new Error('Navigate action requires target URL');
        await this.browser.navigate(action.target);
        const event = await this.createEventWithScreenshot(runId, 'navigation', {
          url: action.target,
          reasoning: action.reasoning,
        });
        callbacks?.onEvent?.(event);
        break;
      }
    }
  }

  private createAndSaveEvent(
    runId: string,
    type: RunEvent['type'],
    data: Record<string, unknown>,
    screenshotPath?: string
  ): RunEvent {
    const event: RunEvent = {
      id: uuid(),
      runId,
      type,
      data,
      screenshotPath,
      timestamp: new Date().toISOString(),
    };
    createEvent(event);
    return event;
  }

  /**
   * Create an event and capture a screenshot in one operation.
   * The screenshot path is set on the event before it's returned.
   */
  private async createEventWithScreenshot(
    runId: string,
    type: RunEvent['type'],
    data: Record<string, unknown>
  ): Promise<RunEvent> {
    const eventId = uuid();
    const screenshotUrl = getScreenshotUrl(runId, eventId);
    const screenshotPath = getScreenshotPath(runId, eventId);

    // Capture screenshot first
    try {
      await this.browser.captureScreenshot(screenshotPath);
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
    }

    // Create event with screenshot path already set
    const event: RunEvent = {
      id: eventId,
      runId,
      type,
      data,
      screenshotPath: screenshotUrl,
      timestamp: new Date().toISOString(),
    };
    createEvent(event);
    return event;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton runner instance (one agent at a time for MVP)
let runnerInstance: AgentRunner | null = null;

export function getRunner(): AgentRunner {
  if (!runnerInstance) {
    runnerInstance = new AgentRunner();
  }
  return runnerInstance;
}
