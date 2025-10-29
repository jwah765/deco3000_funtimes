import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { analyzeUpdate, generateNPCDialogue } from './geminiService.js';
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
    
    // Generate NPC dialogue
    const npcLines = await generateNPCDialogue(
      { ...gameState, meters: newMeters }, 
      deltas
    );
    
    res.json({
      nlp,
      deltas,
      newState: {
        ...gameState,
        round: newRound,
        meters: newMeters
      },
      npcLines,
      ending,
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
