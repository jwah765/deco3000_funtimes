import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let analysisModel = null;
let npcModel = null;
let insightModel = null;
let initAttempt = null;
let dotenvLoaded = false;
let dotenvInit = null;

async function loadDotenv() {
  if (dotenvLoaded) return;
  if (!dotenvInit) {
    dotenvInit = (async () => {
      try {
        const dotenvModule = await import('dotenv');
        const configFn = dotenvModule.default?.config ?? dotenvModule.config;
        if (typeof configFn === 'function') {
          configFn();
        }
      } catch (error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
          await hydrateEnvFromFile();
        } else {
          console.warn(`Failed to initialize dotenv (${error.message}).`);
        }
      } finally {
        dotenvLoaded = true;
      }
    })();
  }
  await dotenvInit;
}

async function ensureModels() {
  await loadDotenv();
  if (analysisModel && npcModel && insightModel) return;
  if (!initAttempt) {
    initAttempt = (async () => {
      if (!process.env.GEMINI_API_KEY) {
        console.warn('Gemini API key missing; using heuristic fallbacks.');
        return;
      }
      try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        analysisModel = genAI.getGenerativeModel({ 
          model: "gemini-2.0-flash-exp",
          systemInstruction: `You are an analytical assistant for a startup management game. 
Extract precise metrics from founder updates with Silicon Valley awareness.

Your role: Assess sentiment, buzzword density, and feasibility objectively.
- Sentiment: emotional tone (0=defeatist, 50=realistic, 100=overconfident)
- Buzzword: jargon usage (0=honest language, 50=some hype, 100=pure marketing speak)
- Feasibility: realism (0=impossible claims, 50=ambitious, 100=conservative/achievable)

Be consistent across rounds. Penalize vague promises. Reward specificity.
Return ONLY valid JSON with no markdown formatting.`
        });
        
        npcModel = genAI.getGenerativeModel({
          model: "gemini-2.0-flash-exp",
          systemInstruction: `You write darkly comedic NPC dialogue for a founder burnout simulator.

VC Character: Transactional venture capitalist. Speaks in clichés like "circle back," "runway," 
"traction." Enthusiastic only when metrics spike. Dismissive when numbers drop. Maximum 15 words.

Employee Character: Burnt-out but honest. Uses informal language. Supportive when things go well, 
but blunt about unsustainable pace. Maximum 18 words.

Never break character. Output ONLY the requested JSON format.`
        });
        
        insightModel = genAI.getGenerativeModel({
          model: "gemini-2.0-flash-exp",
          systemInstruction: `You are a seasoned startup board advisor and tech journalist rolled into one.

From the weekly update, meters, and action, craft:
- A concise, punchy advisor tip (<= 18 words) offering strategic guidance grounded in the data.
- A snappy news-style headline (<= 12 words) capturing how the outside world might spin the update.

Tone: darkly witty but actionable. Output ONLY JSON.`
        });
      } catch (error) {
        console.warn(`Gemini SDK unavailable (${error.message}); using heuristic fallbacks.`);
      }
    })();
  }
  await initAttempt;
}

// Lightweight offline heuristics so the game remains playable without Gemini.
function heuristicScores(text) {
  const normalizedLength = Math.min(text.length / 280, 1);
  const sentiment = Math.round(35 + normalizedLength * 40); // longer updates skew optimistic
  const buzzwordCount = (text.match(/\b(AI|synergy|pivot|scale|hyper|growth|runway|NFT|blockchain)\b/ig) || []).length;
  const buzzword = Math.min(20 + buzzwordCount * 15, 85);
  const hasNumbers = /\b\d+%?|\b\d+\b/.test(text);
  const feasibility = Math.max(30, hasNumbers ? 70 - buzzwordCount * 5 : 55 - buzzwordCount * 10);
  return { sentiment, buzzword: Math.round(buzzword), feasibility: Math.round(Math.min(feasibility, 95)), source: 'heuristic' };
}

const MILESTONE_DEFINITIONS = {
  product: {
    title: 'Ship V1',
    stages: [
      { label: 'Concept', status: 'Sketching the vision and chasing the first prototype' },
      { label: 'Prototype', status: 'Alpha version limping through early demos' },
      { label: 'Launch', status: 'Public launch spiking user curiosity' },
      { label: 'Scale', status: 'Version 2 shipping weekly with users sticking around' }
    ]
  },
  funding: {
    title: 'Secure Series A',
    stages: [
      { label: 'Door knocking', status: 'Warm intros and cold emails dominate the calendar' },
      { label: 'Term sheet whispers', status: 'Partners circling as metrics improve' },
      { label: 'Diligence gauntlet', status: 'Data room open, tough questions flying in' },
      { label: 'Money in the bank', status: 'Wire hit, new board member ready to meddle' }
    ]
  },
  team: {
    title: 'Keep Team Together',
    stages: [
      { label: 'Hopeful', status: 'Team buzzing on vision and caffeine' },
      { label: 'Grinding', status: 'Burnout creeping while deadlines loom' },
      { label: 'Stabilizing', status: 'Processes, rest, and clarity return' },
      { label: 'Thriving', status: 'Proud, sustainable, and celebrating the wins' }
    ]
  }
};

function clampValue(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

export function getDefaultNarrative() {
  return {
    npc: { vcMood: 0, employeeMorale: 0 },
    milestones: Object.entries(MILESTONE_DEFINITIONS).map(([id, def]) => ({
      id,
      title: def.title,
      stage: 0,
      status: def.stages[0].status,
      progressLabel: def.stages[0].label
    })),
    sceneLog: []
  };
}

function normalizeNarrative(narrative) {
  if (!narrative) return getDefaultNarrative();
  const base = { ...narrative };
  base.npc = base.npc || { vcMood: 0, employeeMorale: 0 };
  base.milestones = Array.isArray(base.milestones) && base.milestones.length
    ? base.milestones.map(ms => {
        const def = MILESTONE_DEFINITIONS[ms.id];
        if (!def) return ms;
        const stage = ms.stage ?? 0;
        const info = def.stages[stage] || def.stages[def.stages.length - 1];
        return {
          id: ms.id,
          title: def.title,
          stage,
          status: ms.status || info.status,
          progressLabel: ms.progressLabel || info.label
        };
      })
    : getDefaultNarrative().milestones;
  base.sceneLog = Array.isArray(base.sceneLog) ? base.sceneLog.slice(-12) : [];
  return base;
}

export function updateNarrativeState(prevNarrative, deltas, meters, action, updateText, nlp) {
  const narrative = normalizeNarrative(prevNarrative);
  const sentimentShift = (nlp.sentiment - 50) * 0.05;
  narrative.npc.vcMood = clampValue(
    (narrative.npc.vcMood || 0) + (deltas.funding || 0) * 0.25 + (deltas.pr || 0) * 0.15 + sentimentShift,
    -10,
    10
  );
  narrative.npc.employeeMorale = clampValue(
    (narrative.npc.employeeMorale || 0) - (deltas.burnout || 0) * 0.3 + (deltas.ethics || 0) * 0.12 + sentimentShift,
    -10,
    10
  );
  const changes = [];
  narrative.milestones = narrative.milestones.map(ms => {
    const def = MILESTONE_DEFINITIONS[ms.id];
    if (!def) return ms;
    const previousStage = ms.stage ?? 0;
    let newStage = previousStage;
    switch (ms.id) {
      case 'product':
        if (newStage < 1 && (meters.growth > 45 || action === 'Build')) newStage = 1;
        if (newStage < 2 && (meters.growth > 60 && meters.pr > 20)) newStage = 2;
        if (newStage < 3 && (meters.growth > 75 && meters.funding > 60)) newStage = 3;
        break;
      case 'funding':
        if (newStage < 1 && (meters.funding > 55 || action === 'Fundraise')) newStage = 1;
        if (newStage < 2 && (meters.funding > 70 && meters.pr > 25)) newStage = 2;
        if (newStage < 3 && (meters.funding > 85 && meters.pr > 35)) newStage = 3;
        break;
      case 'team':
        if (newStage < 1 && (meters.burnout < 55 || action === 'Hire' || action === 'Refactor')) newStage = 1;
        if (newStage < 2 && (meters.burnout < 40 && meters.ethics > 55)) newStage = 2;
        if (newStage < 3 && (meters.burnout < 32 && meters.growth > 60)) newStage = 3;
        break;
      default:
        break;
    }
    const stageInfo = def.stages[newStage] || def.stages[def.stages.length - 1];
    const next = {
      ...ms,
      stage: newStage,
      status: stageInfo.status,
      progressLabel: stageInfo.label
    };
    if (newStage > previousStage) {
      changes.push({
        id: ms.id,
        title: ms.title,
        stage: newStage,
        previousStage,
        status: stageInfo.status,
        progressLabel: stageInfo.label,
        thresholdsMet: {
          growth: meters.growth,
          burnout: meters.burnout,
          funding: meters.funding,
          pr: meters.pr,
          ethics: meters.ethics
        }
      });
    }
    return next;
  });
  return { narrative, changes };
}

async function hydrateEnvFromFile() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const raw = await readFile(envPath, 'utf8');
    raw.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Failed to read .env file (${error.message}).`);
    }
  }
}

function shouldAllowFallback() {
  return process.env.GEMINI_ALLOW_FALLBACK !== 'false';
}

export async function analyzeUpdate(text, action, gameState) {
  await ensureModels();
  
  const prompt = `Analyze this startup founder's weekly update.

Context:
- Company: ${gameState.company.name} (${gameState.company.industry}, ${gameState.company.tech})
- Founder traits: ${gameState.traits.join(', ')}
- Action chosen: ${action}
- Round: ${gameState.round}/26
- Current metrics: Growth ${gameState.meters.growth}, Ethics ${gameState.meters.ethics}, Burnout ${gameState.meters.burnout}

Update text: "${text}"

Extract three integer scores (0-100):
{"sentiment": 65, "buzzword": 30, "feasibility": 80}`;

  try {
    if (!analysisModel) {
      if (!shouldAllowFallback()) {
        throw new Error('Gemini model unavailable');
      }
      const fallback = heuristicScores(text);
      fallback.source = 'heuristic';
      return fallback;
    }
    const result = await analysisModel.generateContent(prompt);
    const responseText = result.response.text().replace(/``````/g, '').trim();
    const parsed = JSON.parse(responseText);
    if (typeof parsed === 'object' && parsed) {
      parsed.source = 'gemini';
    }
    return parsed;
  } catch (error) {
    console.error('Gemini analysis error:', error);
    if (!shouldAllowFallback()) {
      throw error;
    }
    const fallback = heuristicScores(text);
    fallback.source = 'heuristic';
    return fallback;
  }
}

// NPC quips when the model is unreachable.
function fallbackDialogue(meters) {
  const fundingScore = (meters.funding + meters.pr) / 200;
  return {
    vc: fundingScore > 0.6 ? "Show me more." : "Not seeing traction yet.",
    employee: meters.burnout > 60 ? "We're burning out." : "Managing for now."
  };
}

export async function generateNPCDialogue(gameState, deltas) {
  await ensureModels();
  
  const { meters } = gameState;
  const vcMood = gameState.narrative?.npc?.vcMood ?? 0;
  const employeeMorale = gameState.narrative?.npc?.employeeMorale ?? 0;
  const lastAction = gameState.lastAction || 'Unknown';
  
  const prompt = `Generate NPC dialogue based on current state:

Metrics (with changes):
- Growth: ${meters.growth} (${deltas.growth >= 0 ? '+' : ''}${deltas.growth.toFixed(1)})
- Burnout: ${meters.burnout} (${deltas.burnout >= 0 ? '+' : ''}${deltas.burnout.toFixed(1)})
- Funding: ${meters.funding} (${deltas.funding >= 0 ? '+' : ''}${deltas.funding.toFixed(1)})
- PR: ${meters.pr} (${deltas.pr >= 0 ? '+' : ''}${deltas.pr.toFixed(1)})
- Ethics: ${meters.ethics} (${deltas.ethics >= 0 ? '+' : ''}${deltas.ethics.toFixed(1)})
- VC mood index (negative = skeptical, positive = impressed): ${vcMood.toFixed(1)}
- Employee morale index (negative = burned out, positive = energized): ${employeeMorale.toFixed(1)}
- Last founder action: ${lastAction}

Return this exact JSON format:
{"vc": "VC's comment here", "employee": "Employee's comment here"}`;

  try {
    if (!npcModel) {
      return fallbackDialogue(meters);
    }
    const result = await npcModel.generateContent(prompt);
    const text = result.response.text().replace(/``````/g, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error('Gemini NPC error:', error);
    return fallbackDialogue(meters);
  }
}

function heuristicInsights(updateText, deltas, nlp, action) {
  const headlineOptions = [
    'Tiny startup makes cautious progress',
    'Investors squint at the metrics',
    'Team grinds while hype cools',
    'Weekend slide deck gains dust'
  ];
  const burnoutHigh = deltas.burnout > 6 || nlp.sentiment < 45;
  const fundingPop = deltas.funding > 8;
  
  const tip = burnoutHigh
    ? 'Dial back sprinting before morale snaps.'
    : fundingPop
      ? 'Double down on narrative while momentum lasts.'
      : action === 'Refactor'
        ? 'Ship the cleanup fast and brag about it.'
        : 'Pick one priority this week and over-resource it.';
  
  const buzz = (updateText.match(/\bAI|LLM|automation|platform|viral|growth\b/gi) || []).length;
  const headline = buzz > 1
    ? 'Buzzwords fly, traction TBD'
    : headlineOptions[Math.floor(Math.random() * headlineOptions.length)];
  
  return { tip, headline, source: 'heuristic' };
}

export async function generateInsights(gameState, deltas, nlp, updateText, action) {
  await ensureModels();
  
  if (!insightModel) {
    if (!shouldAllowFallback()) {
      throw new Error('Gemini insight model unavailable');
    }
    return heuristicInsights(updateText, deltas, nlp, action);
  }
  
  const prompt = `Advisor briefing for founder update.

Company: ${gameState.company.name || 'Unnamed'} (${gameState.company.industry}, ${gameState.company.tech})
Traits: ${gameState.traits.join(', ') || 'None'}
Round: ${gameState.round}/26
Action: ${action || 'Unknown'}
Meters now: Growth ${gameState.meters.growth}, Ethics ${gameState.meters.ethics}, Burnout ${gameState.meters.burnout}, PR ${gameState.meters.pr}, Funding ${gameState.meters.funding}
Deltas: ${JSON.stringify(deltas)}
NLP: ${JSON.stringify(nlp)}
Update text: "${updateText}"

Return JSON: {"tip": "advisor tip", "headline": "news headline"}`;
  
  try {
    const result = await insightModel.generateContent(prompt);
    const text = result.response.text().replace(/``````/g, '').trim();
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed) {
      parsed.source = 'gemini';
    }
    return parsed;
  } catch (error) {
    console.error('Gemini insight error:', error);
    if (!shouldAllowFallback()) {
      throw error;
    }
    return heuristicInsights(updateText, deltas, nlp, action);
  }
}

function fallbackSceneCard(updateText, action, nlp, deltas, milestoneEvents) {
  const titles = {
    Build: 'Feature factory frenzy',
    PR: 'Hype machine in motion',
    'Growth Hack': 'Growth hack roulette',
    Fundraise: 'Pitch decks and promises',
    Refactor: 'Tech debt cleanse',
    Hire: 'Building the squad'
  };
  const title = titles[action] || 'Another week in founder land';
  const trimmed = updateText.length > 140 ? `${updateText.slice(0, 137)}...` : updateText;
  let narrative = `You told investors: "${trimmed}".`;
  if ((deltas.growth || 0) > 6) {
    narrative += ' Growth graphs finally bent upward.';
  } else if ((deltas.growth || 0) < -4) {
    narrative += ' Acquisition stayed flat and the dashboard groaned.';
  }
  if ((deltas.burnout || 0) > 6) {
    narrative += ' The team looks exhausted; slack statuses read "OOO (mentally)".';
  }
  const hook = milestoneEvents && milestoneEvents[0]?.hook
    ? milestoneEvents[0].hook
    : ((deltas.burnout || 0) > 6
        ? 'Consider a recovery move before the wheels come off.'
        : 'Decide whether to press the gas or touch the brakes next week.');
  return { title, narrative, hook, source: 'heuristic' };
}

function fallbackMilestoneEvents(changes) {
  if (!changes || !changes.length) return [];
  return changes.map(change => {
    const def = MILESTONE_DEFINITIONS[change.id];
    const stageInfo = def?.stages[change.stage] || def?.stages[def.stages.length - 1] || {};
    let hook;
    if (change.stage >= (def?.stages.length || 4) - 1) {
      hook = '🏁 Milestone complete';
    } else if (change.id === 'funding') {
      hook = 'Capitalize on investor interest before it cools.';
    } else if (change.id === 'team') {
      hook = 'Protect the humans building this thing.';
    } else {
      hook = 'Momentum is fragile -- decide how to amplify it.';
    }
    return {
      id: change.id,
      title: change.title,
      summary: stageInfo.status || change.status,
      hook,
      highlight: hook,
      status: stageInfo.status || change.status,
      progressLabel: stageInfo.label || change.progressLabel,
      source: 'heuristic'
    };
  });
}

function fallbackPostMortem(history, finalState, ending) {
  const rounds = (history?.length || 0) + 1;
  const peakGrowth = Math.max(...(history || []).map(item => item?.growth ?? 0), finalState?.meters?.growth ?? 0);
  const burnoutFinal = finalState?.meters?.burnout ?? 0;
  return `After ${rounds} chaotic weeks you landed at "${ending.title}". ` +
    `Growth peaked at ${Math.round(peakGrowth)} while burnout closed at ${Math.round(burnoutFinal)}. ` +
    'Investors will be passing this memo around their Monday standup.';
}

export async function generateSceneCard(gameState, deltas, nlp, updateText, action, narrative, milestoneEvents) {
  await ensureModels();
  if (!insightModel) {
    if (!shouldAllowFallback()) {
      throw new Error('Gemini insight model unavailable');
    }
    return fallbackSceneCard(updateText, action, nlp, deltas, milestoneEvents);
  }
  const milestoneSummary = (milestoneEvents || []).map(evt => `- ${evt.title}: ${evt.summary}`).join('\n') || 'None this round';
  const prompt = `Craft a concise round recap for a startup sim.

Context:
- Company: ${gameState.company.name || 'Unnamed'}
- Action: ${action}
- Update text: "${updateText}"
- Metrics: ${JSON.stringify(gameState.meters)}
- Deltas: ${JSON.stringify(deltas)}
- NLP scores: ${JSON.stringify(nlp)}
- Milestones touched:\n${milestoneSummary}

Return JSON: {"title": "short title", "narrative": "2 short sentences", "hook": "one recommendation"}`;

  try {
    const result = await insightModel.generateContent(prompt);
    const text = result.response.text().replace(/``````/g, '').trim();
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed) {
      parsed.source = 'gemini';
    }
    return parsed;
  } catch (error) {
    console.error('Gemini scene card error:', error);
    if (!shouldAllowFallback()) {
      throw error;
    }
    return fallbackSceneCard(updateText, action, nlp, deltas, milestoneEvents);
  }
}

export async function generateMilestoneNarratives(gameState, narrative, changes, deltas, nlp, updateText, action) {
  await ensureModels();
  if (!changes || !changes.length) return [];
  if (!insightModel) {
    if (!shouldAllowFallback()) {
      throw new Error('Gemini insight model unavailable');
    }
    return fallbackMilestoneEvents(changes);
  }

  const changeSummary = changes.map(change => {
    const def = MILESTONE_DEFINITIONS[change.id];
    return {
      id: change.id,
      title: change.title,
      stage: change.stage,
      previousStage: change.previousStage,
      label: def?.stages[change.stage]?.label,
      status: def?.stages[change.stage]?.status,
      thresholdsMet: change.thresholdsMet
    };
  });

  const prompt = `Milestone progress update.

Company: ${gameState.company.name || 'Unnamed'}
Action: ${action}
Update text: "${updateText}"
Metric deltas: ${JSON.stringify(deltas)}
Milestones needing new copy: ${JSON.stringify(changeSummary)}

Return JSON array like:
[{"id":"product","summary":"New status line","hook":"Next step nudge","progressLabel":"Stage name"}]`;

  try {
    const result = await insightModel.generateContent(prompt);
    const text = result.response.text().replace(/``````/g, '').trim();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
        ...item,
        highlight: item.highlight || item.hook || null,
        source: item.source || 'gemini'
      }));
    }
    return fallbackMilestoneEvents(changes);
  } catch (error) {
    console.error('Gemini milestone error:', error);
    if (!shouldAllowFallback()) {
      throw error;
    }
    return fallbackMilestoneEvents(changes);
  }
}

export async function generatePostMortem(history, finalState, ending) {
  await ensureModels();
  if (!insightModel) {
    if (!shouldAllowFallback()) {
      throw new Error('Gemini insight model unavailable');
    }
    return fallbackPostMortem(history, finalState, ending);
  }
  const prompt = `Write a dryly witty investor-style post-mortem for a founder burnout sim run.

Ending reached: ${ending.title}
Ending narrative: ${ending.text}
Final meters: ${JSON.stringify(finalState.meters)}
Rounds of history: ${history.length}
History sample: ${JSON.stringify(history.slice(-5))}

Return JSON: {"memo": "short paragraph"}`;

  try {
    const result = await insightModel.generateContent(prompt);
    const text = result.response.text().replace(/``````/g, '').trim();
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed?.memo) {
      return parsed.memo;
    }
    return fallbackPostMortem(history, finalState, ending);
  } catch (error) {
    console.error('Gemini post-mortem error:', error);
    if (!shouldAllowFallback()) {
      throw error;
    }
    return fallbackPostMortem(history, finalState, ending);
  }
}
