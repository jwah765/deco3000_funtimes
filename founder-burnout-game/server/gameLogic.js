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

export function getPhaseTitle(round) {
  return PHASE_TITLES[Math.min(round - 1, PHASE_TITLES.length - 1)];
}

export function computeDeltas(nlp, action, gameState) {
  const { sentiment, buzzword, feasibility } = nlp;
  const { meters, traits, company } = gameState;
  
  let deltas = { growth: 0, ethics: 0, burnout: 0, pr: 0, funding: 0 };
  
  // Base action effects
  const actionEffects = {
    'Build': { growth: 5, ethics: 2, burnout: 8, pr: -2, funding: -3 },
    'PR': { growth: 2, ethics: -1, burnout: 3, pr: 12, funding: 3 },
    'Growth Hack': { growth: 15, ethics: -8, burnout: 10, pr: -5, funding: 5 },
    'Fundraise': { growth: -2, ethics: 0, burnout: 5, pr: 8, funding: 12 },
    'Refactor': { growth: -5, ethics: 5, burnout: -8, pr: -3, funding: -5 },
    'Hire': { growth: 3, ethics: 3, burnout: -12, pr: 2, funding: -15 }
  };
  
  const baseEffects = actionEffects[action] ?? actionEffects['Build'];
  deltas = { ...baseEffects };
  
  // NLP modifiers (sentiment, buzzword, feasibility influence outcomes)
  deltas.growth += (sentiment - 50) * 0.15;
  deltas.pr += (sentiment - 50) * 0.2;
  deltas.ethics -= (buzzword - 50) * 0.1;  // High buzzword = less ethics
  deltas.funding += (feasibility - 20) * 0.08;
  deltas.burnout += (100 - feasibility) * 0.05;  // Low feasibility = stress
  
  // Industry modifiers
  const industryMods = getIndustryModifiers(company.industry);
  const techMods = getTechModifiers(company.tech);
  
  // Apply multipliers to deltas (not raw meters)
  if (deltas.growth > 0) deltas.growth *= industryMods.growth * techMods.growth;
  if (deltas.ethics < 0) deltas.ethics *= industryMods.ethics_risk * techMods.ethics_risk;
  if (deltas.pr > 0) deltas.pr *= industryMods.pr * techMods.pr;
  if (deltas.funding > 0) deltas.funding *= industryMods.funding * techMods.funding;
  
  // Trait effects
  if (traits.includes('Ambition')) {
    if (action === 'PR' || action === 'Fundraise') deltas.pr += 5;
    deltas.burnout += 1;
  }
  if (traits.includes('Integrity')) {
    if (deltas.ethics < 0) deltas.ethics *= 0.5;
    if (action === 'Growth Hack') deltas.pr -= 2;
  }
  if (traits.includes('Resilience')) {
    deltas.burnout -= 6;
  }
  if (traits.includes('Charisma') && action === 'Fundraise') {
    deltas.funding += 5;
  }
  if (traits.includes('Critical Thinking')) {
    deltas.feasibility = Math.min(100, feasibility * 1.1);
  }
  
  return deltas;
}

export function applyDeltas(deltas, gameState) {
  const newMeters = { ...gameState.meters };
  
  for (let key in deltas) {
    newMeters[key] = Math.max(0, Math.min(100, newMeters[key] + deltas[key]));
  }
  
  return newMeters;
}

export function checkEnding(meters, round) {
  const { growth, ethics, burnout, funding, pr } = meters;
  
  // Instant fail conditions
  if (burnout > 80) return { 
    title: 'Collapse', 
    text: 'You burnt out. Your co-founder took over while you checked into a wellness retreat in Bali. The company pivoted to selling NFTs.' 
  };
  if (funding < 0) return { 
    title: 'Bankruptcy', 
    text: 'You ran out of runway. Your last Slack message was "brb" three months ago. The domain expired.' 
  };
  
  // Game complete - check final endings
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

function getIndustryModifiers(industry) {
  const mods = {
    'Healthcare': { growth: 0.9, ethics_risk: 0.6, pr: 0.9, funding: 1.0 },
    'Software': { growth: 1.0, ethics_risk: 1.0, pr: 1.0, funding: 1.0 },
    'Finance': { growth: 1.0, ethics_risk: 1.2, pr: 1.0, funding: 1.1 },
    'Electronics': { growth: 1.1, ethics_risk: 1.0, pr: 1.0, funding: 1.0 }
  };
  return mods[industry] || mods['Software'];
}

function getTechModifiers(tech) {
  const mods = {
    'Software': { growth: 1.0, ethics_risk: 1.0, pr: 1.0, funding: 1.0 },
    'AI/Automation': { growth: 1.0, ethics_risk: 1.2, pr: 1.15, funding: 1.0 },
    'Physical Product': { growth: 0.9, ethics_risk: 1.0, pr: 1.1, funding: 0.95 }
  };
  return mods[tech] || mods['Software'];
}
