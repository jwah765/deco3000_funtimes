let gameState = {
  round: 1,
  company: { name: "", industry: "Software", tech: "Software" },
  traits: [],
  meters: { growth: 35, ethics: 60, burnout: 25, pr: 10, funding: 50 },
  history: []
};

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

// Game screen logic
const updateTextArea = document.getElementById('updateText');
const charCountSpan = document.getElementById('charCount');

updateTextArea.addEventListener('input', () => {
  charCountSpan.textContent = updateTextArea.value.length;
});

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
  
  // Disable submit button and show loading
  const submitBtn = document.getElementById('submitRound');
  const loadingMsg = document.getElementById('loadingMessage');
  submitBtn.disabled = true;
  loadingMsg.classList.add('active');
  
  try {
    const response = await fetch('/api/process-round', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, action, gameState })
    });
    
    if (!response.ok) {
      throw new Error('Server error');
    }
    
    const result = await response.json();
    
    // Update game state
    gameState = result.newState;
    gameState.history.push({ round: gameState.round - 1, text, action, ...result.nlp });
    
    // Update UI
    updateMeters(result.newState.meters);
    updateExplainability(result.nlp);
    updateNPCs(result.npcLines);
    updatePhaseTitle(result.phaseTitle);
    updateRoundDisplay(result.newState.round);
    
    // Clear text area
    updateTextArea.value = '';
    charCountSpan.textContent = '0';
    
    // Check for ending
    if (result.ending) {
      setTimeout(() => showEnding(result.ending, result.newState.meters), 1000);
    }
    
  } catch (error) {
    console.error('Error:', error);
    alert('Failed to process round. Check console and try again.');
  } finally {
    submitBtn.disabled = false;
    loadingMsg.classList.remove('active');
  }
});

function updateMeters(meters) {
  for (let key in meters) {
    const value = Math.round(meters[key]);
    document.getElementById(`${key}-bar`).style.width = `${value}%`;
    document.getElementById(`${key}-val`).textContent = value;
  }
}

function updateExplainability(nlp) {
  document.getElementById('sentiment').textContent = nlp.sentiment;
  document.getElementById('buzzword').textContent = nlp.buzzword;
  document.getElementById('feasibility').textContent = nlp.feasibility;
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
}

function showEnding(ending, finalMeters) {
  document.getElementById('endingTitle').textContent = ending.title;
  document.getElementById('endingText').textContent = ending.text;
  
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
    history: []
  };
  
  updateMeters(gameState.meters);
  document.getElementById('sentiment').textContent = '—';
  document.getElementById('buzzword').textContent = '—';
  document.getElementById('feasibility').textContent = '—';
  document.getElementById('vc-line').textContent = '"Waiting for your first update..."';
  document.getElementById('emp-line').textContent = '"Let\'s ship something."';
  
  showScreen('setup');
});

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

