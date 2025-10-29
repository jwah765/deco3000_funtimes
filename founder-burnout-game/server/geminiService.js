import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model with system instruction for consistent tone
const analysisModel = genAI.getGenerativeModel({ 
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

const npcModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
  systemInstruction: `You write darkly comedic NPC dialogue for a founder burnout simulator.

VC Character: Transactional venture capitalist. Speaks in clichés like "circle back," "runway," 
"traction." Enthusiastic only when metrics spike. Dismissive when numbers drop. Maximum 15 words.

Employee Character: Burnt-out but honest. Uses informal language. Supportive when things go well, 
but blunt about unsustainable pace. Maximum 18 words.

Never break character. Output ONLY the requested JSON format.`
});

export async function analyzeUpdate(text, action, gameState) {
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
    const result = await analysisModel.generateContent(prompt);
    const text = result.response.text().replace(/``````/g, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error('Gemini analysis error:', error);
    return { sentiment: 50, buzzword: 50, feasibility: 50 };
  }
}

export async function generateNPCDialogue(gameState, deltas) {
  const { meters } = gameState;
  
  const prompt = `Generate NPC dialogue based on current state:

Metrics (with changes):
- Growth: ${meters.growth} (${deltas.growth >= 0 ? '+' : ''}${deltas.growth.toFixed(1)})
- Burnout: ${meters.burnout} (${deltas.burnout >= 0 ? '+' : ''}${deltas.burnout.toFixed(1)})
- Funding: ${meters.funding} (${deltas.funding >= 0 ? '+' : ''}${deltas.funding.toFixed(1)})
- PR: ${meters.pr} (${deltas.pr >= 0 ? '+' : ''}${deltas.pr.toFixed(1)})
- Ethics: ${meters.ethics} (${deltas.ethics >= 0 ? '+' : ''}${deltas.ethics.toFixed(1)})

Return this exact JSON format:
{"vc": "VC's comment here", "employee": "Employee's comment here"}`;

  try {
    const result = await npcModel.generateContent(prompt);
    const text = result.response.text().replace(/``````/g, '').trim();
    return JSON.parse(text);
  } catch (error) {
    console.error('Gemini NPC error:', error);
    // Fallback dialogue
    const fundingScore = (meters.funding + meters.pr) / 200;
    return {
      vc: fundingScore > 0.6 ? "Show me more." : "Not seeing traction yet.",
      employee: meters.burnout > 60 ? "We're burning out." : "Managing for now."
    };
  }
}
