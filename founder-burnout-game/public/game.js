const MILESTONE_DEFINITIONS = {
  product: {
    title: 'Ship V1',
    stages: [
      { label: 'Concept', status: 'Sketching the vision' },
      { label: 'Prototype', status: 'Alpha build limping through demos' },
      { label: 'Launch', status: 'Public launch riding a spike of signups' },
      { label: 'Scale', status: 'Feature velocity humming, users sticking around' }
    ]
  },
  funding: {
    title: 'Secure Series A',
    stages: [
      { label: 'Door knocking', status: 'Warm intros and cold emails galore' },
      { label: 'Term sheet whispers', status: 'VCs nibbling on traction charts' },
      { label: 'Diligence gauntlet', status: 'Data room open, partner meeting scheduled' },
      { label: 'Money in the bank', status: 'Wire hit, runway reset, new board member incoming' }
    ]
  },
  team: {
    title: 'Keep Team Together',
    stages: [
      { label: 'Hopeful', status: 'Everyone thinks this might actually work' },
      { label: 'Grinding', status: 'Late nights + code red weekends take a toll' },
      { label: 'Stabilizing', status: 'Process, boundaries, and better sleep regain trust' },
      { label: 'Thriving', status: 'Team humming, celebrating wins without burnout' }
    ]
  }
};

function createDefaultNarrative() {
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

let gameState = {
  round: 1,
  company: { name: "", industry: "Software", tech: "Software" },
  traits: [],
  meters: { growth: 35, ethics: 60, burnout: 25, pr: 10, funding: 50 },
  history: [],
  narrative: createDefaultNarrative()
};

let detailsCollapsed = false;
let previousMeters = { ...gameState.meters };
let reactionOverlay = null;
let audioCtx = null;

const STAT_CONFIG = {
  growth: { fillId: 'growth-fill', valueId: 'growth-val', statId: 'stat-growth', positiveMetric: true },
  ethics: { fillId: 'ethics-fill', valueId: 'ethics-val', statId: 'stat-ethics', positiveMetric: true },
  burnout: { fillId: 'burnout-fill', valueId: 'burnout-val', statId: 'stat-burnout', positiveMetric: false },
  pr: { fillId: 'pr-fill', valueId: 'pr-val', statId: 'stat-pr', positiveMetric: true },
  funding: { fillId: 'funding-fill', valueId: 'funding-val', statId: 'stat-funding', positiveMetric: true }
};

const ACTION_NARRATIVES = {
  Build: 'You vanished into sprint tunnels, chasing the next feature spark.',
  PR: 'You worked the inbox, weaving a story that might just land on TechCrunch.',
  'Growth Hack': 'You unleashed another wild experiment hoping the metrics explode upward.',
  Fundraise: 'Deck in hand, you charmed rooms of investors while suppressing imposter syndrome.',
  Refactor: 'You hit pause on features to clean brittle code that threatened to crumble.',
  Hire: 'You expanded the crew, betting that more hands will steady the rocket.'
};

const RANDOM_EVENTS = [
  {
    title: 'Influencer shout-out',
    text: 'A niche influencer tweeted an unsolicited rave about your product.',
    effects: { growth: 6, pr: 8, funding: 4 }
  },
  {
    title: 'Production fire drill',
    text: 'An overnight outage sent support into chaos and your team into overdrive.',
    effects: { growth: -4, burnout: 10, pr: -3 }
  },
  {
    title: 'Team offsite breakthrough',
    text: 'A scrappy offsite loosened shoulders and unlocked a smarter roadmap.',
    effects: { burnout: -12, ethics: 5 }
  },
  {
    title: 'Regulatory scare',
    text: 'A regulator requested information about your latest growth stunt.',
    effects: { ethics: -8, funding: -5, pr: -4 }
  },
  {
    title: 'Enterprise pilot',
    text: 'A Fortune 500 signed a pilot that could redefine your runway.',
    effects: { funding: 12, growth: 5, burnout: 3 }
  },
  {
    title: 'Culture hero moment',
    text: 'An engineer shipped a quality-of-life fix that the whole team cheered.',
    effects: { burnout: -8, ethics: 4 }
  }
];

// Setup screen logic
document.getElementById('startGame').addEventListener('click', () => {
  const name = document.getElementById('companyName').value.trim() || 'StartupCo';
  const industry = document.getElementById('industry').value;
  const tech = document.getElementById('tech').value;
  const traitBoxes = document.querySelectorAll('#traits input[type="checkbox"]:checked');
  const traits = Array.from(traitBoxes).map(cb => cb.value);
  
  if (traits.length !== 2) {
    alert('Please select exactly 2 traits!');
    return;
  }
  
  gameState.company = { name, industry, tech };
  gameState.traits = traits;
  
  document.getElementById('companyDisplay').textContent = name;
  
  showScreen('game');
});

document.querySelectorAll('.setup-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-tab');
    document.querySelectorAll('.setup-tab').forEach(btn => btn.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.setup-panel').forEach(panel => {
      if (panel.id === target) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });
  });
});

// Game screen logic
const updateTextArea = document.getElementById('updateText');
const charCountSpan = document.getElementById('charCount');

updateTextArea.addEventListener('input', () => {
  charCountSpan.textContent = updateTextArea.value.length;
});

updateAdvisorInsights(null, null);
resetRoundSummary();
updateBackground(gameState.meters.burnout);
updateProgress(gameState.round);

const detailsContainer = document.getElementById('analysisDetails');

document.getElementById('submitRound').addEventListener('click', async () => {
  const text = updateTextArea.value.trim();
  const actionRadio = document.querySelector('input[name="action"]:checked');
  
  if (!text) {
    alert('Write an update first!');
    return;
  }
  
  if (!actionRadio) {
    alert('Choose an action!');
    return;
  }
  
  const action = actionRadio.value;
  gameState.lastAction = action;
  
  // Disable submit button and show loading
  const submitBtn = document.getElementById('submitRound');
  const loadingMsg = document.getElementById('loadingMessage');
  submitBtn.disabled = true;
  loadingMsg.classList.add('active');
  
  try {
    const result = await processRound(text, action);
    console.info('Analysis source:', result.analysisSource);
    if (!result.insights) {
      const stateForInsights = result.newState ? cloneState(result.newState) : cloneState(gameState);
      result.insights = generateInsightsLocal(stateForInsights, action, result.deltas || {}, result.nlp || {}, text);
      result.insightsSource = result.insights.source || 'unknown';
    }
    
    // Update game state
    gameState = result.newState;
    if (result.narrative) {
      gameState.narrative = result.narrative;
    } else if (!gameState.narrative) {
      gameState.narrative = createDefaultNarrative();
    }
    gameState.history.push({
      round: gameState.round - 1,
      text,
      action,
      ...result.nlp,
      analysisSource: result.analysisSource,
      insights: result.insights,
      insightsSource: result.insightsSource,
      sceneCard: result.sceneCard,
      milestoneEvents: result.milestoneEvents,
      meters: { ...result.newState.meters }
    });
    
    // Update UI
    updateMeters(result.newState.meters);
    updateExplainability(result.nlp, result.analysisSource);
    updateAdvisorInsights(result.insights, result.insightsSource);
    updateRoundSummary(result, action);
    updateNPCs(result.npcLines);
    updatePhaseTitle(result.phaseTitle);
    updateRoundDisplay(result.newState.round);
    const reactionMessage = (result.sceneCard && (result.sceneCard.hook || result.sceneCard.narrative))
      || (result.insights && result.insights.tip)
      || 'Week resolved.';
    const reactionType = determineReactionType(result.deltas);
    showReaction(reactionMessage, reactionType);
    if (!result.ending) {
      maybeTriggerRandomEvent(action);
    }
    
    // Clear text area
    updateTextArea.value = '';
    charCountSpan.textContent = '0';
    
    // Check for ending
    if (result.ending) {
      setTimeout(() => showEnding(result.ending, result.newState.meters, result.postMortem), 1000);
    }
    
  } catch (error) {
    console.error('Error processing round:', error);
    alert('Failed to process round. Check console and try again.');
  } finally {
    submitBtn.disabled = false;
    loadingMsg.classList.remove('active');
  }
});

async function processRound(text, action) {
  try {
    return await requestServerRound(text, action);
  } catch (error) {
    console.warn('Falling back to offline simulation.', error);
    return simulateOfflineRound(text, action, gameState);
  }
}

async function requestServerRound(text, action) {
  const response = await fetch('/api/process-round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, action, gameState })
  });
  
  if (!response.ok) {
    const message = `Server error (${response.status})`;
    throw new Error(message);
  }
  
  const result = await response.json();
  
  if (result && result.error) {
    throw new Error(result.error);
  }
  
  if (!result.analysisSource && result.nlp && result.nlp.source) {
    result.analysisSource = result.nlp.source;
  }
  
  return result;
}

function updateStat(key, value) {
  const config = STAT_CONFIG[key];
  if (!config) return 0;
  const fillEl = document.getElementById(config.fillId);
  const valueEl = document.getElementById(config.valueId);
  const statEl = document.getElementById(config.statId);
  const newValue = clampValue(Number(value) || 0, 0, 100);
  const previous = previousMeters[key] ?? newValue;
  previousMeters[key] = newValue;
  if (valueEl) {
    valueEl.textContent = Math.round(newValue);
  }
  if (fillEl) {
    requestAnimationFrame(() => {
      fillEl.style.width = `${newValue}%`;
    });
  }
  const delta = newValue - previous;
  if (statEl && Math.abs(delta) >= 1) {
    statEl.classList.remove('pulse-positive', 'pulse-negative');
    const positiveChange = config.positiveMetric ? delta >= 0 : delta < 0;
    const className = positiveChange ? 'pulse-positive' : 'pulse-negative';
    statEl.classList.add(className);
    setTimeout(() => statEl.classList.remove(className), 550);
  }
  if (fillEl) {
    fillEl.classList.remove('glow-positive', 'glow-negative');
    if (Math.abs(delta) >= 2) {
      const positiveChange = config.positiveMetric ? delta >= 0 : delta < 0;
      const glowClass = positiveChange ? 'glow-positive' : 'glow-negative';
      fillEl.classList.add(glowClass);
      setTimeout(() => fillEl.classList.remove(glowClass), 500);
    }
  }
  if (Math.abs(delta) >= 8) {
    const positiveChange = config.positiveMetric ? delta >= 0 : delta < 0;
    playTone(positiveChange ? 'success' : 'fail');
  } else if (Math.abs(delta) >= 4) {
    playTone('warning');
  }
  gameState.meters[key] = newValue;
  if (key === 'burnout') {
    updateBackground(newValue);
  }
  return delta;
}

function updateMeters(meters) {
  Object.keys(STAT_CONFIG).forEach(statKey => {
    if (typeof meters[statKey] === 'number') {
      updateStat(statKey, meters[statKey]);
    }
  });
}

function updateExplainability(nlp, source) {
  document.getElementById('sentiment').textContent = nlp.sentiment;
  document.getElementById('buzzword').textContent = nlp.buzzword;
  document.getElementById('feasibility').textContent = nlp.feasibility;
  const sourceLabel = document.getElementById('analysisSource');
  if (sourceLabel) {
    const labelMap = {
      gemini: 'Gemini API',
      heuristic: 'Fallback heuristic',
      offline: 'Offline simulator',
      local: 'Offline simulator'
    };
    const normalized = typeof source === 'string' ? source.toLowerCase() : 'unknown';
    sourceLabel.textContent = labelMap[normalized] || (source || 'unknown');
  }
}

function updateAdvisorInsights(insights, source) {
  const tipEl = document.getElementById('advisorTip');
  const headlineEl = document.getElementById('worldHeadline');
  const sourceEl = document.getElementById('insightsSource');
  const labelMap = {
    gemini: 'Gemini API',
    heuristic: 'Fallback heuristic',
    offline: 'Offline simulator',
    local: 'Offline simulator'
  };
  if (!insights) {
    if (tipEl) tipEl.textContent = '—';
    if (headlineEl) headlineEl.textContent = '—';
    if (sourceEl) sourceEl.textContent = '—';
    return;
  }
  if (tipEl) tipEl.textContent = insights.tip || '—';
  if (headlineEl) headlineEl.textContent = insights.headline || '—';
  if (sourceEl) {
    const normalized = typeof source === 'string' ? source.toLowerCase() : (insights.source || 'unknown');
    sourceEl.textContent = labelMap[normalized] || (source || insights.source || 'unknown');
  }
}

function ensureReactionOverlay() {
  if (reactionOverlay) return reactionOverlay;
  reactionOverlay = document.createElement('div');
  reactionOverlay.className = 'reaction-overlay';
  document.body.appendChild(reactionOverlay);
  return reactionOverlay;
}

function showReaction(text, type = 'warning') {
  if (!text) return;
  const overlay = ensureReactionOverlay();
  const message = document.createElement('div');
  message.className = `reaction-message reaction-${type}`;
  message.textContent = text;
  overlay.appendChild(message);
  setTimeout(() => {
    message.remove();
  }, 2100);
}

function playTone(type) {
  const duration = 0.25;
  const frequencies = {
    success: 620,
    warning: 420,
    fail: 250
  };
  const freq = frequencies[type] || frequencies.warning;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = freq;
  gain.gain.value = 0.12;
  oscillator.connect(gain);
  gain.connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + duration);
}

function updateBackground(burnout) {
  const intensity = clampValue(burnout, 0, 100) / 100;
  const startR = Math.round(10 + intensity * 120);
  const startG = Math.round(10 + intensity * 35);
  const startB = Math.round(20 + intensity * 15);
  document.body.style.background = `radial-gradient(circle at top left, rgba(${startR}, ${startG}, ${startB}, 1), rgba(5,5,7,1) 65%)`;
}

function updateProgress(round) {
  const fill = document.getElementById('progress-fill');
  if (!fill) return;
  const ratio = clampValue(round, 0, 26) / 26;
  fill.style.width = `${ratio * 100}%`;
}

function determineReactionType(deltas = {}) {
  let strongestKey = null;
  let strongestMagnitude = -Infinity;
  Object.entries(deltas).forEach(([key, value]) => {
    if (typeof value !== 'number') return;
    const magnitude = Math.abs(value);
    if (magnitude > strongestMagnitude) {
      strongestMagnitude = magnitude;
      strongestKey = key;
    }
  });
  if (!strongestKey || strongestMagnitude < 3) return 'warning';
  const config = STAT_CONFIG[strongestKey];
  if (!config) return 'warning';
  const delta = deltas[strongestKey];
  const positive = config.positiveMetric ? delta >= 0 : delta < 0;
  return positive ? 'success' : 'fail';
}

function displayStory(action, sceneCard, milestoneEvents) {
  const storyEl = document.getElementById('story');
  if (!storyEl) return;
  const base = (sceneCard && sceneCard.narrative) || ACTION_NARRATIVES[action] || '';
  const milestoneLine = milestoneEvents && milestoneEvents.length ? ` ${milestoneEvents[0].summary || ''}` : '';
  const text = (base + milestoneLine).trim();
  storyEl.textContent = text;
  storyEl.classList.remove('visible');
  void storyEl.offsetWidth;
  if (text) {
    storyEl.classList.add('visible');
  }
}

function showEventCard(event) {
  const card = document.createElement('div');
  card.className = 'event-card';
  card.innerHTML = `<h4>${event.title}</h4><p>${event.text}</p>`;
  document.body.appendChild(card);
  setTimeout(() => {
    card.remove();
  }, 4000);
}

function applyEffects(effects = {}) {
  const applied = {};
  Object.entries(effects).forEach(([key, delta]) => {
    if (!STAT_CONFIG[key]) return;
    const target = (gameState.meters[key] ?? 0) + delta;
    applied[key] = updateStat(key, target);
  });
  return applied;
}

function maybeTriggerRandomEvent(action) {
  if (gameState.round >= 26) return null;
  if (Math.random() > 0.35) return null;
  const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
  showEventCard(event);
  const deltasApplied = applyEffects(event.effects);
  const score = (deltasApplied.growth || 0) + (deltasApplied.funding || 0) + (deltasApplied.pr || 0) + (deltasApplied.ethics || 0) - (deltasApplied.burnout || 0);
  const reactionType = score >= 5 ? 'success' : score <= -5 ? 'fail' : 'warning';
  showReaction(event.title, reactionType);
  if (gameState.history.length) {
    const last = gameState.history[gameState.history.length - 1];
    last.randomEvent = event.title;
    last.meters = { ...gameState.meters };
  }
  return event;
}
function resetRoundSummary() {
  const headlineEl = document.getElementById('summaryHeadline');
  const ctaEl = document.getElementById('summaryCTA');
  const highlightEl = document.getElementById('summaryHighlight');
  if (headlineEl) headlineEl.textContent = 'Submit your first update to see how the world reacts.';
  if (ctaEl) ctaEl.textContent = 'Balance growth, ethics, burnout, funding, and PR.';
  if (highlightEl) {
    highlightEl.textContent = '';
    highlightEl.style.display = 'none';
  }
  const storyEl = document.getElementById('story');
  if (storyEl) {
    storyEl.textContent = '';
    storyEl.classList.remove('visible');
  }
}

function updateRoundSummary(result, action) {
  const headlineEl = document.getElementById('summaryHeadline');
  const ctaEl = document.getElementById('summaryCTA');
  const highlightEl = document.getElementById('summaryHighlight');
  if (!headlineEl || !ctaEl || !highlightEl) return;
  const scene = result.sceneCard || {};
  const milestoneEvent = Array.isArray(result.milestoneEvents) && result.milestoneEvents.length
    ? result.milestoneEvents[0]
    : null;
  const fallbackHeadline = result.insights?.headline || 'Mixed signals from the front lines.';
  const fallbackCTA = result.insights?.tip || 'Keep iterating toward balance before the board panics.';
  headlineEl.textContent = scene.title || milestoneEvent?.title || fallbackHeadline;
  ctaEl.textContent = scene.narrative || scene.body || milestoneEvent?.summary || fallbackCTA;
  const deltas = result.deltas || {};
  let highlightText = scene.hook || milestoneEvent?.hook || milestoneEvent?.highlight;
  if (!highlightText) {
    let strongest = null;
    Object.entries(deltas).forEach(([key, value]) => {
      if (typeof value !== 'number') return;
      const magnitude = Math.abs(value);
      if (!strongest || magnitude > strongest.magnitude) {
        strongest = { key, value, magnitude };
      }
    });
    const labelMap = {
      growth: 'Growth',
      ethics: 'Ethics',
      burnout: 'Burnout',
      pr: 'PR',
      funding: 'Funding'
    };
    if (strongest && strongest.magnitude >= 4) {
      const emoji = strongest.value >= 0 ? '⬆️' : '⬇️';
      const label = labelMap[strongest.key] || strongest.key;
      highlightText = `${emoji} ${label} ${strongest.value > 0 ? '+' : ''}${Math.round(strongest.value)}`;
    }
  }
  if (highlightText) {
    highlightEl.textContent = highlightText;
    highlightEl.style.display = 'inline-block';
  } else {
    highlightEl.textContent = '';
    highlightEl.style.display = 'none';
  }
  displayStory(action, scene, result.milestoneEvents || (milestoneEvent ? [milestoneEvent] : []));
}

function updateNPCs(npcLines) {
  document.getElementById('vc-line').textContent = `"${npcLines.vc}"`;
  document.getElementById('emp-line').textContent = `"${npcLines.employee}"`;
}

function updatePhaseTitle(title) {
  document.getElementById('phaseTitle').textContent = title;
}

function updateRoundDisplay(round) {
  document.getElementById('roundDisplay').textContent = round;
  updateProgress(round);
}

function showEnding(ending, finalMeters, postMortem) {
  document.getElementById('endingTitle').textContent = ending.title;
  document.getElementById('endingText').textContent = ending.text;
  const postEl = document.getElementById('endingPostMortem');
  if (postEl) {
    if (postMortem) {
      postEl.textContent = postMortem;
      postEl.style.display = 'block';
    } else {
      postEl.textContent = '';
      postEl.style.display = 'none';
    }
  }
  
  const finalStats = document.getElementById('finalStats');
  finalStats.innerHTML = `
    <div><strong>${Math.round(finalMeters.growth)}</strong><span>Growth</span></div>
    <div><strong>${Math.round(finalMeters.ethics)}</strong><span>Ethics</span></div>
    <div><strong>${Math.round(finalMeters.burnout)}</strong><span>Burnout</span></div>
    <div><strong>${Math.round(finalMeters.pr)}</strong><span>PR</span></div>
    <div><strong>${Math.round(finalMeters.funding)}</strong><span>Funding</span></div>
  `;
  
  showScreen('ending');
}

document.getElementById('restart').addEventListener('click', () => {
  gameState = {
    round: 1,
    company: { name: "", industry: "Software", tech: "Software" },
    traits: [],
    meters: { growth: 35, ethics: 60, burnout: 25, pr: 10, funding: 50 },
    history: [],
    narrative: createDefaultNarrative()
  };
  previousMeters = { ...gameState.meters };
  
  updateMeters(gameState.meters);
  document.getElementById('sentiment').textContent = '—';
  document.getElementById('buzzword').textContent = '—';
  document.getElementById('feasibility').textContent = '—';
  const sourceLabel = document.getElementById('analysisSource');
  if (sourceLabel) {
    sourceLabel.textContent = '—';
  }
  updateAdvisorInsights(null, null);
  resetRoundSummary();
  document.getElementById('vc-line').textContent = '"Waiting for your first update..."';
  document.getElementById('emp-line').textContent = '"Let\'s ship something."';
  
  showScreen('setup');
});

const PHASE_TITLES = [
  "Week 1: Gloomy Monday", "Week 2: Scrappy Tuesday", "Week 3: Pivot Wednesday",
  "Week 4: Hump Day Hustle", "Week 5: Throwback Thursday", "Week 6: Feature Friday",
  "Week 7: Sprint Saturday", "Week 8: Sunday Scaries", "Week 9: Momentum Monday",
  "Week 10: Tech Debt Tuesday", "Week 11: Wireframe Wednesday", "Week 12: Demo Thursday",
  "Week 13: Fundraise Friday", "Week 14: Burnout Saturday", "Week 15: Recovery Sunday",
  "Week 16: Metrics Monday", "Week 17: Press Tuesday", "Week 18: Hiring Wednesday",
  "Week 19: Scale Thursday", "Week 20: Crunch Friday", "Week 21: All-Hands Saturday",
  "Week 22: Reflect Sunday", "Week 23: Final Push Monday", "Week 24: Last Mile Tuesday",
  "Week 25: Demo Day Eve", "Week 26: Judgment Day"
];

function cloneState(state) {
  return {
    round: state.round,
    company: { ...state.company },
    traits: [...state.traits],
    meters: { ...state.meters },
    history: [...state.history],
    narrative: JSON.parse(JSON.stringify(state.narrative || createDefaultNarrative()))
  };
}

function simulateOfflineRound(text, action, currentState) {
  const stateSnapshot = cloneState(currentState);
  const nlp = analyzeUpdateLocally(text);
  nlp.source = 'offline';
  const deltas = computeDeltasLocally(nlp, action, stateSnapshot);
  const newMeters = applyDeltasLocally(deltas, stateSnapshot);
  const newRound = stateSnapshot.round + 1;
  const ending = checkEndingLocally(newMeters, newRound);
  const { narrative, changes } = updateNarrativeStateLocal(stateSnapshot.narrative, deltas, newMeters, action, text, nlp);
  const milestoneEvents = generateMilestoneEventsLocal(narrative, changes, deltas, action, nlp, text);
  milestoneEvents.forEach(evt => {
    const target = narrative.milestones.find(ms => ms.id === evt.id);
    if (target) {
      target.status = evt.status || target.status;
      target.progressLabel = evt.progressLabel || target.progressLabel;
    }
  });
  const sceneCard = generateSceneCardLocal(text, action, nlp, deltas, narrative, milestoneEvents);
  narrative.sceneLog = (narrative.sceneLog || []).concat(sceneCard).slice(-12);
  const narrativeState = { ...stateSnapshot, meters: newMeters, round: newRound, narrative };
  const insights = generateInsightsLocal(narrativeState, action, deltas, nlp, text);
  const npcLines = generateNPCDialogueLocal(newMeters, deltas, narrative);
  const postMortem = ending ? generatePostMortemLocal(stateSnapshot.history || [], newMeters, ending) : null;
  
  return {
    nlp,
    deltas,
    analysisSource: nlp.source,
    insights,
    insightsSource: insights.source,
    sceneCard,
    milestoneEvents,
    newState: {
      ...stateSnapshot,
      round: newRound,
      meters: newMeters,
      narrative
    },
    npcLines,
    ending,
    postMortem,
    phaseTitle: getPhaseTitleLocal(newRound)
  };
}

function analyzeUpdateLocally(text) {
  const normalizedLength = Math.min(text.length / 280, 1);
  const sentiment = Math.round(35 + normalizedLength * 40);
  const buzzwordCount = (text.match(/\b(AI|synergy|pivot|scale|hyper|growth|runway|NFT|blockchain|virality)\b/ig) || []).length;
  const buzzword = Math.min(20 + buzzwordCount * 15, 90);
  const hasNumbers = /\b\d+%?|\b\d+\b/.test(text);
  const feasibilityBase = hasNumbers ? 72 : 58;
  const feasibility = Math.max(30, Math.min(95, feasibilityBase - buzzwordCount * 6));
  return { sentiment, buzzword: Math.round(buzzword), feasibility: Math.round(feasibility) };
}

function computeDeltasLocally(nlp, action, gameState) {
  const { sentiment, buzzword, feasibility } = nlp;
  const { traits, company } = gameState;
  
  const actionEffects = {
    'Build': { growth: 5, ethics: 2, burnout: 8, pr: -2, funding: -3 },
    'PR': { growth: 2, ethics: -1, burnout: 3, pr: 12, funding: 3 },
    'Growth Hack': { growth: 15, ethics: -8, burnout: 10, pr: -5, funding: 5 },
    'Fundraise': { growth: -2, ethics: 0, burnout: 5, pr: 8, funding: 12 },
    'Refactor': { growth: -5, ethics: 5, burnout: -8, pr: -3, funding: -5 },
    'Hire': { growth: 3, ethics: 3, burnout: -12, pr: 2, funding: -15 }
  };
  
  const baseEffects = actionEffects[action] ?? actionEffects['Build'];
  const deltas = { ...baseEffects };
  
  deltas.growth += (sentiment - 50) * 0.15;
  deltas.pr += (sentiment - 50) * 0.2;
  deltas.ethics -= (buzzword - 50) * 0.1;
  deltas.funding += (feasibility - 20) * 0.08;
  deltas.burnout += (100 - feasibility) * 0.05;
  
  const industryMods = getIndustryModifiersLocal(company.industry);
  const techMods = getTechModifiersLocal(company.tech);
  
  if (deltas.growth > 0) deltas.growth *= industryMods.growth * techMods.growth;
  if (deltas.ethics < 0) deltas.ethics *= industryMods.ethics_risk * techMods.ethics_risk;
  if (deltas.pr > 0) deltas.pr *= industryMods.pr * techMods.pr;
  if (deltas.funding > 0) deltas.funding *= industryMods.funding * techMods.funding;
  
  if (traits.includes('Ambition')) {
    if (action === 'PR' || action === 'Fundraise') deltas.pr += 5;
    deltas.burnout += 1;
  }
  if (traits.includes('Integrity') && deltas.ethics < 0) {
    deltas.ethics *= 0.5;
  }
  if (traits.includes('Resilience')) {
    deltas.burnout -= 6;
  }
  if (traits.includes('Charisma') && action === 'Fundraise') {
    deltas.funding += 5;
  }
  
  return deltas;
}

function applyDeltasLocally(deltas, gameState) {
  const newMeters = { ...gameState.meters };
  for (let key in deltas) {
    newMeters[key] = Math.max(0, Math.min(100, newMeters[key] + deltas[key]));
  }
  return newMeters;
}

function clampValue(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function updateNarrativeStateLocal(prevNarrative, deltas, meters, action, text, nlp) {
  const narrative = prevNarrative ? JSON.parse(JSON.stringify(prevNarrative)) : createDefaultNarrative();
  narrative.sceneLog = narrative.sceneLog || [];
  narrative.npc = narrative.npc || { vcMood: 0, employeeMorale: 0 };
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
  narrative.milestones = (narrative.milestones || []).map(ms => {
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
        progressLabel: stageInfo.label
      });
    }
    return next;
  });
  return { narrative, changes };
}

function generateMilestoneEventsLocal(narrative, changes, deltas, action, nlp, text) {
  if (!changes || !changes.length) return [];
  return changes.map(change => {
    const def = MILESTONE_DEFINITIONS[change.id];
    const stageInfo = def?.stages[change.stage] || { status: change.status, label: change.progressLabel };
    let hook;
    if (change.stage >= (def?.stages.length || 4) - 1) {
      hook = '🏁 Milestone complete';
    } else if (change.id === 'funding') {
      hook = 'Line up the next investor meetings while the story is hot.';
    } else if (change.id === 'team') {
      hook = 'Protect the humans that keep this thing alive.';
    } else {
      hook = 'Capitalize on the momentum before it cools.';
    }
    return {
      id: change.id,
      title: change.title,
      summary: stageInfo.status,
      hook,
      highlight: hook,
      status: stageInfo.status,
      progressLabel: stageInfo.label,
      source: 'offline'
    };
  });
}

function generateSceneCardLocal(updateText, action, nlp, deltas, narrative, milestoneEvents) {
  const actionTitles = {
    Build: 'Feature factory frenzy',
    PR: 'Hype machine in motion',
    'Growth Hack': 'Growth hack roulette',
    Fundraise: 'Pitch decks and promises',
    Refactor: 'Tech debt cleanse',
    Hire: 'Building the squad'
  };
  const title = actionTitles[action] || 'Another week in founder land';
  const growthPulse = Math.round((deltas.growth || 0) + (deltas.pr || 0) * 0.4);
  const burnoutPulse = Math.round(deltas.burnout || 0);
  const trimmedUpdate = updateText.length > 140 ? `${updateText.slice(0, 137)}...` : updateText;
  let narrativeText = `You reported: "${trimmedUpdate}".`;
  if (growthPulse > 6) {
    narrativeText += ' Users are actually sticking around.';
  } else if (growthPulse < -3) {
    narrativeText += ' Traction slipped and dashboards look worried.';
  }
  if (burnoutPulse > 6) {
    narrativeText += ' The team looks exhausted -- eyes on that burnout meter.';
  } else if (burnoutPulse < -4) {
    narrativeText += ' The crew finally caught a breather.';
  }
  const milestoneHook = milestoneEvents && milestoneEvents[0]?.hook;
  const hook = milestoneHook || (burnoutPulse > 6 ? 'Consider Hire or Refactor before people revolt.' : 'Decide whether to double down or regroup next week.');
  return {
    title,
    narrative: narrativeText,
    hook,
    source: 'offline'
  };
}

function generatePostMortemLocal(history, finalMeters, ending) {
  const rounds = history.length + 1;
  const growthValues = history.map(h => (h.meters?.growth ?? h.growth ?? 0));
  growthValues.push(finalMeters.growth || 0);
  const burnoutValues = history.map(h => (h.meters?.burnout ?? h.burnout ?? 100));
  burnoutValues.push(finalMeters.burnout || 100);
  const peakGrowth = Math.max(...growthValues);
  const minBurnout = Math.min(...burnoutValues);
  return `After ${rounds} frantic weeks you landed at "${ending.title}". ` +
    `Peak growth touched ${Math.round(peakGrowth)} while burnout bottomed out at ${Math.round(minBurnout)}. ` +
    'Investors will be reading this post-mortem over overpriced cold brew tomorrow.';
}

function checkEndingLocally(meters, round) {
  const { growth, ethics, burnout, funding, pr } = meters;
  if (burnout > 80) {
    return {
      title: 'Collapse',
      text: 'You burnt out. Your co-founder took over while you checked into a wellness retreat in Bali. The company pivoted to selling NFTs.'
    };
  }
  if (funding < 0) {
    return {
      title: 'Bankruptcy',
      text: 'You ran out of runway. Your last Slack message was "brb" three months ago. The domain expired.'
    };
  }
  if (round < 26) return null;
  
  if (growth > 80 && ethics > 50 && burnout < 30) {
    return {
      title: 'IPO Success',
      text: 'You did it. CNBC called. Your Series C valued you at $2B. Your biggest problem now is choosing between Goldman and Morgan Stanley.'
    };
  }
  
  if (funding > 80 && ethics < 40) {
    return {
      title: 'Acquisition',
      text: 'Google bought you for $400M. You signed a 2-year retention agreement. Your LinkedIn now says "Entrepreneur, Investor, Advisor."'
    };
  }
  
  if (ethics > 80 && burnout < 40 && growth < 70) {
    return {
      title: 'Pivot to Wellness',
      text: 'You realized happiness > growth. Now you run a 4-person agency that closes at 4pm Fridays. Your therapist is proud of you.'
    };
  }
  
  if (pr < 10 && ethics < 30) {
    return {
      title: 'Infamy',
      text: 'TechCrunch wrote a scathing exposé. Your Wikipedia page exists but only to document the controversies. You moved to Wyoming.'
    };
  }
  
  return {
    title: 'Stable Mediocrity',
    text: 'You built a sustainable business. 20 employees, $3M ARR, no headlines. Your parents still ask when you\'ll get a "real job."'
  };
}

function getIndustryModifiersLocal(industry) {
  const mods = {
    'Healthcare': { growth: 0.9, ethics_risk: 0.6, pr: 0.9, funding: 1.0 },
    'Software': { growth: 1.0, ethics_risk: 1.0, pr: 1.0, funding: 1.0 },
    'Finance': { growth: 1.0, ethics_risk: 1.2, pr: 1.0, funding: 1.1 },
    'Electronics': { growth: 1.1, ethics_risk: 1.0, pr: 1.0, funding: 1.0 }
  };
  return mods[industry] || mods['Software'];
}

function getTechModifiersLocal(tech) {
  const mods = {
    'Software': { growth: 1.0, ethics_risk: 1.0, pr: 1.0, funding: 1.0 },
    'AI/Automation': { growth: 1.0, ethics_risk: 1.2, pr: 1.15, funding: 1.0 },
    'Physical Product': { growth: 0.9, ethics_risk: 1.0, pr: 1.1, funding: 0.95 }
  };
  return mods[tech] || mods['Software'];
}

function generateNPCDialogueLocal(meters, deltas, narrative) {
  const vcMood = narrative?.npc?.vcMood ?? 0;
  const employeeMorale = narrative?.npc?.employeeMorale ?? 0;
  const bigWin = deltas.growth >= 10 || deltas.funding >= 10 || deltas.pr >= 10;
  const bigLoss = deltas.ethics <= -8 || deltas.funding <= -10 || deltas.burnout >= 12;
  let vcLine;
  if (vcMood > 4) {
    vcLine = bigWin ? 'This is the story LPs want -- keep sending charts.' : 'We can sell this, but I need sharper traction next week.';
  } else if (vcMood < -4) {
    vcLine = bigLoss ? 'Runway math is ugly. Spin or spend less.' : 'Still not buying the narrative. Tighten it up fast.';
  } else {
    vcLine = bigWin ? 'Good momentum. Keep the metrics coming.' : bigLoss ? 'Numbers are soft. Need a sharper story.' : 'Seeing steady signals -- do not stall now.';
  }
  let employeeLine;
  if (employeeMorale < -4 || meters.burnout > 70) {
    employeeLine = "Team's fried. Need air before we crash.";
  } else if (deltas.burnout < -6) {
    employeeLine = "Appreciate the breather. Let's keep it humane.";
  } else if (employeeMorale > 4) {
    employeeLine = "We're fired up -- keep sending real wins.";
  } else {
    employeeLine = "We're grinding, but still standing.";
  }
  return { vc: vcLine, employee: employeeLine };
}

function generateInsightsLocal(state, action, deltas, nlp, text) {
  const { meters } = state;
  const stressHigh = meters.burnout > 65 || deltas.burnout > 6;
  const fundingHigh = meters.funding > 70 || deltas.funding > 8;
  const ethicsLow = meters.ethics < 35 || deltas.ethics < -5;
  let tip;
  if (stressHigh) {
    tip = 'Stabilize the team before the next big push.';
  } else if (ethicsLow && action === 'Growth Hack') {
    tip = 'Patch the trust leaks before regulators sniff around.';
  } else if (fundingHigh && action === 'Fundraise') {
    tip = 'Ride the momentum -- lock terms while goodwill lasts.';
  } else {
    tip = 'Pair the next sprint with one measurable win.';
  }
  const hypeWords = (text.match(/AI|automation|platform|viral|hyper/ig) || []).length;
  let headline;
  if (hypeWords >= 2 && nlp.sentiment > 55) {
    headline = 'Buzz builds around bold promises';
  } else if (stressHigh) {
    headline = 'Whispers of burnout surface internally';
  } else if (fundingHigh) {
    headline = 'Investors eye the upbeat metrics';
  } else {
    headline = 'Steady progress amid cautious optimism';
  }
  return { tip, headline, source: 'offline' };
}

function getPhaseTitleLocal(round) {
  return PHASE_TITLES[Math.min(round - 1, PHASE_TITLES.length - 1)];
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}
