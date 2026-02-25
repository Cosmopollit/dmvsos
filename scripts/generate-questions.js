const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const manualText = fs.readFileSync('./scripts/wa_manual.txt', 'utf8');

const topics = [
  'traffic signs and signals',
  'speed limits and following distance',
  'right of way rules',
  'turning and lane changes',
  'parking rules',
  'alcohol and drugs while driving',
  'insurance and license requirements',
  'pedestrians and cyclists',
  'highway driving',
  'emergencies and accidents'
];

async function generateForTopic(topic, chunkText) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are a DMV test question writer for Washington State.
      
Based on this section of the Washington Driver Guide:
${chunkText.slice(0, 8000)}

Generate exactly 10 multiple choice questions about: ${topic}

Rules:
- Questions must be based ONLY on the manual text provided
- Each question must have exactly 4 options (A, B, C, D)
- Only one correct answer
- Include a brief explanation (1-2 sentences) why the answer is correct
- Questions should be practical and exam-like
- Vary difficulty: 3 easy, 4 medium, 3 hard

Return ONLY valid JSON array:
[
  {
    "question": "...",
    "a": "...",
    "b": "...",
    "c": "...",
    "d": "...",
    "correct": "a",
    "explanation": "..."
  }
]`
    }]
  });

  const text = response.content[0].text;
  const clean = text.replace(/\`\`\`json|\`\`\`/g, '').trim();
  return JSON.parse(clean);
}

async function main() {
  console.log('Generating questions for Washington...');
  const chunkSize = Math.floor(manualText.length / topics.length);
  let allQuestions = [];

  for (let i = 0; i < topics.length; i++) {
    const chunk = manualText.slice(i * chunkSize, (i + 1) * chunkSize);
    console.log(`Topic ${i+1}/${topics.length}: ${topics[i]}`);
    try {
      const questions = await generateForTopic(topics[i], chunk);
      allQuestions = allQuestions.concat(questions);
      console.log(`Generated ${questions.length} questions`);
    } catch(e) {
      console.error(`Error on topic ${topics[i]}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // Save to file first for review
  fs.writeFileSync('./scripts/wa_questions.json', JSON.stringify(allQuestions, null, 2));
  console.log(`\nTotal: ${allQuestions.length} questions saved to scripts/wa_questions.json`);
  console.log('Review the file, then run upload script');
}

main();
