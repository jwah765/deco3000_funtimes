import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  analyzeUpdate,
  generateNPCDialogue,
  generateInsights,
  updateNarrativeState,
  generateSceneCard,
  generateMilestoneNarratives,
  generatePostMortem,
  getDefaultNarrative
} from './geminiService.js';
import { computeDeltas, applyDeltas, checkEnding, getPhaseTitle } from './gameLogic.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/process-round', async (req, res) => {
  try {
    const { text, action, gameState } = req.body;
    
    console.log(`Processing round ${gameState.round}: ${action}`);
    
    // Call Gemini for NLP analysis
    const nlp = await analyzeUpdate(text, action, gameState);
    
    // Compute game logic
    const deltas = computeDeltas(nlp, action, gameState);
    const newMeters = applyDeltas(deltas, gameState);
    const newRound = gameState.round + 1;
    
    // Check for endings
    const ending = checkEnding(newMeters, newRound);
    
    const previousNarrative = gameState.narrative || getDefaultNarrative();
    const { narrative: updatedNarrative, changes: milestoneChanges } = updateNarrativeState(
      previousNarrative,
      deltas,
      newMeters,
      action,
      text,
      nlp
    );
    const stateForNarrative = {
      ...gameState,
      meters: newMeters,
      round: newRound,
      narrative: updatedNarrative,
      lastAction: action
    };
    
    // Generate narrative beats
    const milestoneEvents = await generateMilestoneNarratives(
      stateForNarrative,
      updatedNarrative,
      milestoneChanges,
      deltas,
      nlp,
      text,
      action
    );
    if (milestoneEvents.length) {
      updatedNarrative.milestones = updatedNarrative.milestones.map(ms => {
        const match = milestoneEvents.find(evt => evt.id === ms.id);
        return match
          ? {
              ...ms,
              status: match.status || ms.status,
              progressLabel: match.progressLabel || ms.progressLabel
            }
          : ms;
      });
    }
    const sceneCard = await generateSceneCard(
      stateForNarrative,
      deltas,
      nlp,
      text,
      action,
      updatedNarrative,
      milestoneEvents
    );
    updatedNarrative.sceneLog = [...(updatedNarrative.sceneLog || []), sceneCard].slice(-12);
    
    // Generate NPC dialogue
    const npcLines = await generateNPCDialogue(stateForNarrative, deltas);
    
    // Advisor tips and world headline
    const insights = await generateInsights(stateForNarrative, deltas, nlp, text, action);
    
    const historyForPost = Array.isArray(gameState.history) ? [...gameState.history] : [];
    historyForPost.push({ text, action, deltas, nlp, meters: newMeters });
    const postMortem = ending
      ? await generatePostMortem(
          historyForPost,
          { meters: newMeters, narrative: updatedNarrative },
          ending
        )
      : null;
    
    res.json({
      nlp,
      deltas,
      analysisSource: nlp.source || 'unknown',
      sceneCard,
      insights,
      insightsSource: insights?.source || 'unknown',
      milestoneEvents,
      newState: {
        ...gameState,
        round: newRound,
        meters: newMeters,
        narrative: updatedNarrative
      },
      narrative: updatedNarrative,
      npcLines,
      ending,
      postMortem,
      phaseTitle: getPhaseTitle(newRound)
    });
  } catch (error) {
    console.error('Error processing round:', error);
    res.status(500).json({ error: 'Processing failed', details: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Game ready at http://localhost:${PORT}`);
});
