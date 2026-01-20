import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import type {
  PageState,
  LLMDecision,
  AgentArchetype,
  AgentAction,
  RunEvent,
  FrictionPoint,
  Recommendation,
  FrictionCategory,
} from '@dryrun/shared';

export class GeminiService {
  private model: GenerativeModel;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  }

  async decideNextAction(
    goal: string,
    archetype: AgentArchetype,
    pageState: PageState,
    actionHistory: RunEvent[],
    screenshotBase64?: string
  ): Promise<LLMDecision> {
    const historyText = this.formatActionHistory(actionHistory);
    const elementsText = this.formatPageElements(pageState);
    const exampleFrictionsText = archetype.exampleFrictions
      .map((f) => `  - ${f}`)
      .join('\n');

    const prompt = `${archetype.systemPrompt}

## Your Goal
${goal}

## Current Page
URL: ${pageState.url}
Title: ${pageState.title}

## Visible Elements
${elementsText}

## Action History (last ${Math.min(actionHistory.length, 10)} actions)
${historyText || 'No actions taken yet.'}

## Your Task
Based on the current page state and your goal, decide what action to take next.

Analyze:
1. What do you observe on this page?
2. How does this relate to your goal?
3. Is there any friction or confusion you're experiencing?
4. What action should you take?

## Friction Detection Guidelines
You should detect friction when you encounter issues that match your archetype's concerns.

Example frictions for your archetype:
${exampleFrictionsText}

Friction Categories:
- "navigation": Can't find where to go, confusing menus, unclear paths
- "forms": Validation issues, unclear labels, too many fields, confusing inputs
- "contentClarity": Jargon, unclear instructions, missing information
- "visualDesign": Poor contrast, small targets, bad hierarchy, cluttered layout
- "performance": Slow loading, unresponsive elements
- "accessibility": WCAG violations, keyboard issues, missing labels

When detecting friction, also identify:
- Pattern: What behavior triggered this? (repeatedClicks, backtracking, scrollHunting, formAbandonment, hesitation, errorRecovery)
- Element: What element caused the issue? (selector, text, type)
- Heuristic violation: Which Nielsen heuristic is violated? (e.g., "Nielsen #4: Consistency")
- WCAG violation: Which WCAG criterion is violated? (e.g., "WCAG 2.4.4: Link Purpose")

Respond in this exact JSON format:
{
  "observation": "What you see on the page and its relevance to your goal",
  "reasoning": "Your thought process for choosing the next action",
  "action": {
    "type": "click|type|scroll|navigate|done|stuck",
    "target": "selector or text of element to interact with (for click/type)",
    "value": "text to type (only for type action)",
    "reasoning": "Why this specific action"
  },
  "frictionAssessment": {
    "detected": true/false,
    "description": "What makes this confusing or difficult (if friction detected)",
    "severity": "low|medium|high (if friction detected)",
    "category": "navigation|forms|contentClarity|visualDesign|performance|accessibility",
    "pattern": "repeatedClicks|backtracking|scrollHunting|formAbandonment|hesitation|errorRecovery (optional)",
    "element": {
      "selector": "CSS selector of problematic element",
      "visibleText": "text visible on the element",
      "elementType": "button|link|input|text|image|etc"
    },
    "heuristicViolation": "Nielsen #X: Description (if applicable)",
    "wcagViolation": "WCAG X.X.X: Description (if applicable)"
  }
}

Action type guidelines:
- "click": Click on a button, link, or interactive element
  - target: Use the EXACT text of the element (e.g., "Sign up", "Search", "Log in")
  - Or use the CSS selector provided in parentheses (e.g., "#submit-btn", "button.primary")
- "type": Enter text into an input field
  - target: Use the placeholder text, label, or "search" for search boxes
  - value: The text you want to type
- "scroll": Scroll down to see more content (no target needed)
- "navigate": Go to a specific URL (target = full URL starting with https://)
- "done": Goal has been achieved
- "stuck": Cannot proceed, something is blocking progress

IMPORTANT for "type" actions:
- For search boxes, use target: "search" or "Search Wikipedia" (the placeholder text)
- For form fields, use the field label or placeholder as target
- Do NOT use vague descriptions like "search box" or "input field"

Remember your archetype constraints:
- Reading style: ${archetype.constraints.readingStyle}
- Patience level: ${archetype.constraints.patience}
- Tech literacy: ${archetype.constraints.techLiteracy}
- Input method: ${archetype.constraints.inputMethod || 'mouse'}
- You will abandon after ${archetype.constraints.maxFrictionPoints} friction points`;

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt },
    ];

    // Add screenshot if available
    if (screenshotBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: screenshotBase64,
        },
      });
    }

    const result = await this.model.generateContent(parts);
    const response = result.response.text();

    return this.parseDecision(response);
  }

  async generateRecommendations(
    goal: string,
    archetype: AgentArchetype,
    events: RunEvent[],
    frictionPoints: FrictionPoint[]
  ): Promise<Recommendation[]> {
    const eventsText = events
      .filter((e) => ['click', 'type', 'reasoning', 'friction'].includes(e.type))
      .slice(-20)
      .map((e) => `- ${e.type}: ${JSON.stringify(e.data)}`)
      .join('\n');

    const frictionText = frictionPoints
      .map(
        (fp) =>
          `- [${fp.severity}] [${fp.category}] ${fp.description}${fp.element ? ` (Element: ${fp.element.selector})` : ''}${fp.heuristicViolation ? ` - ${fp.heuristicViolation}` : ''}${fp.wcagViolation ? ` - ${fp.wcagViolation}` : ''}`
      )
      .join('\n');

    const prioritiesText = Object.entries(archetype.priorities)
      .map(([key, value]) => `  - ${key}: ${value}/5`)
      .join('\n');

    const prompt = `Based on a UX test run, provide actionable recommendations to improve the user experience.

## Test Goal
${goal}

## Archetype Tested
Name: ${archetype.name}
Description: ${archetype.description}
Category: ${archetype.category}

## Archetype Priorities (1-5 scale)
${prioritiesText}

## Friction Points Detected
${frictionText || 'None detected'}

## Key Events
${eventsText}

## Task
Provide 3-5 specific, actionable recommendations to improve the UX. For each recommendation, analyze:
1. What specific issue needs to be addressed
2. How difficult it is to fix
3. What type of change it is
4. Which archetypes are affected
5. What the current state is vs suggested state

Recommendation Types:
- "quickWin": Easy fixes with high impact
- "majorChange": Significant changes requiring more effort
- "contentFix": Copy, labels, or text improvements
- "bugFix": Actual bugs or broken functionality
- "enhancement": Nice-to-have improvements

Effort Levels:
- "easy": Can be fixed in under an hour
- "medium": Requires a few hours to a day
- "hard": Requires significant development effort

Calculate priority (1-5) based on: severity × archetype priority for that category

Respond with a JSON array:
[
  {
    "title": "Short action-oriented title",
    "description": "Detailed explanation of the issue and solution",
    "type": "quickWin|majorChange|contentFix|bugFix|enhancement",
    "effort": "easy|medium|hard",
    "priority": 1-5,
    "category": "navigation|forms|contentClarity|visualDesign|performance|accessibility",
    "element": {
      "selector": "CSS selector if applicable",
      "visibleText": "visible text if applicable",
      "elementType": "element type"
    },
    "currentState": "Description of current problematic state",
    "suggestedState": "Description of improved state",
    "affectedArchetypes": ["archetype-id-1", "archetype-id-2"],
    "impactScore": 1-10
  }
]

Focus on:
1. Addressing detected friction points first
2. Issues that match the archetype's priorities
3. Quick wins that are easy to implement
4. Specific, actionable changes (not vague suggestions)`;

    const result = await this.model.generateContent(prompt);
    const response = result.response.text();

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Recommendation[];
        // Validate and ensure all required fields exist
        return parsed.map((rec) => ({
          title: rec.title || 'Untitled Recommendation',
          description: rec.description || '',
          type: rec.type || 'enhancement',
          effort: rec.effort || 'medium',
          priority: rec.priority || 3,
          category: rec.category || 'contentClarity',
          element: rec.element,
          currentState: rec.currentState,
          suggestedState: rec.suggestedState,
          affectedArchetypes: rec.affectedArchetypes || [archetype.id],
          impactScore: rec.impactScore || 5,
        }));
      }
    } catch {
      // Fall back to basic recommendation
    }

    return [
      {
        title: 'Review and address friction points',
        description: 'Review the friction points identified during testing and address them.',
        type: 'enhancement',
        effort: 'medium',
        priority: 3,
        category: 'contentClarity',
        affectedArchetypes: [archetype.id],
        impactScore: 5,
      },
    ];
  }

  private formatActionHistory(events: RunEvent[]): string {
    const relevantEvents = events
      .filter((e) => ['navigation', 'click', 'type', 'scroll', 'reasoning'].includes(e.type))
      .slice(-10);

    return relevantEvents
      .map((e, i) => {
        const data = e.data as Record<string, unknown>;
        switch (e.type) {
          case 'navigation':
            return `${i + 1}. Navigated to: ${data.url}`;
          case 'click':
            return `${i + 1}. Clicked: ${data.target}`;
          case 'type':
            return `${i + 1}. Typed "${data.value}" into ${data.target}`;
          case 'scroll':
            return `${i + 1}. Scrolled ${data.direction}`;
          case 'reasoning':
            return `${i + 1}. Thought: ${data.reasoning}`;
          default:
            return `${i + 1}. ${e.type}: ${JSON.stringify(data)}`;
        }
      })
      .join('\n');
  }

  private formatPageElements(pageState: PageState): string {
    const grouped: Record<string, typeof pageState.elements> = {
      buttons: [],
      links: [],
      inputs: [],
      text: [],
      other: [],
    };

    pageState.elements.forEach((el) => {
      if (el.type === 'button') grouped.buttons.push(el);
      else if (el.type === 'link') grouped.links.push(el);
      else if (el.type === 'input') grouped.inputs.push(el);
      else if (el.type === 'text') grouped.text.push(el);
      else grouped.other.push(el);
    });

    let result = '';

    if (grouped.buttons.length) {
      result += '\nButtons:\n';
      result += grouped.buttons.map((b) => `  - "${b.text}" (${b.selector})`).join('\n');
    }

    if (grouped.links.length) {
      result += '\n\nLinks:\n';
      result += grouped.links
        .map((l) => `  - "${l.text}" (${l.selector}) -> ${l.attributes?.href || ''}`)
        .join('\n');
    }

    if (grouped.inputs.length) {
      result += '\n\nInput Fields (use the quoted text as target for "type" actions):\n';
      result += grouped.inputs
        .map((i) => {
          const inputType = i.attributes?.type || 'text';
          const placeholder = i.attributes?.placeholder;
          // Show what to use as target
          return `  - [${inputType}] target="${i.text}"${placeholder ? ` (placeholder: "${placeholder}")` : ''} (selector: ${i.selector})`;
        })
        .join('\n');
    }

    if (grouped.text.length) {
      result += '\n\nVisible Text:\n';
      result += grouped.text.map((t) => `  - ${t.text}`).join('\n');
    }

    return result || 'No interactive elements found.';
  }

  private parseDecision(response: string): LLMDecision {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize the response
      const action: AgentAction = {
        type: parsed.action?.type || 'stuck',
        target: parsed.action?.target,
        value: parsed.action?.value,
        reasoning: parsed.action?.reasoning || parsed.reasoning || '',
        frictionAssessment: parsed.frictionAssessment
          ? {
              detected: Boolean(parsed.frictionAssessment.detected),
              description: parsed.frictionAssessment.description,
              severity: parsed.frictionAssessment.severity,
              category: parsed.frictionAssessment.category as FrictionCategory | undefined,
              pattern: parsed.frictionAssessment.pattern,
              element: parsed.frictionAssessment.element,
              heuristicViolation: parsed.frictionAssessment.heuristicViolation,
              wcagViolation: parsed.frictionAssessment.wcagViolation,
            }
          : undefined,
      };

      return {
        observation: parsed.observation || '',
        reasoning: parsed.reasoning || '',
        action,
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', response, error);
      return {
        observation: 'Failed to parse response',
        reasoning: 'Error parsing LLM output',
        action: {
          type: 'stuck',
          reasoning: 'Failed to determine next action due to parsing error',
        },
      };
    }
  }
}
