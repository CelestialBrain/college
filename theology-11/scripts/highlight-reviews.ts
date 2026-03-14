import fs from 'fs';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { callGemini } from '../src/vertex.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dataPath = path.join(__dirname, '..', 'output', 'reviewer-data.json');

async function highlightTopicReviews() {
  console.log('Reading output/reviewer-data.json...');
  if (!fs.existsSync(dataPath)) {
    console.error(`File not found: ${dataPath}. Please run generate-reviewer first.`);
    process.exit(1);
  }
  
  const knowledgeData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const systemInstruction = `You are a helpful theology teaching assistant. 
Your task is to take a text provided by the user and highlight the key theological concepts, important terms, or critical ideas by wrapping them in double asterisks so they are automatically bolded in markdown (e.g., **Key Concept**).

Rules:
1. ONLY add ** around key terms.
2. DO NOT change the structure, wording, or content of the original text.
3. DO NOT add new sentences.
4. DO NOT wrap entire sentences in bold. Only pinpoint specific key concepts/terms (1-4 words max per highlight).
5. Output ONLY the modified text with the asterisks added, and absolutely nothing else.`;

  let modifiedCount = 0;

  for (let setIdx = 0; setIdx < knowledgeData.sets.length; setIdx++) {
    const set = knowledgeData.sets[setIdx];
    
    for (let topicIdx = 0; topicIdx < set.topics.length; topicIdx++) {
      const topic = set.topics[topicIdx];
      
      if (!topic.review) {
        console.log(`Skipping ${topic.title} - no review found.`);
        continue;
      }

      console.log(`Processing Topic: ${topic.title} ...`);

      try {
        const prompt = `${systemInstruction}\n\nORIGINAL TEXT TO HIGHLIGHT:\n${topic.review}`;
        const response = await callGemini(prompt);
        
        // Basic safety check to ensure it didn't just summarize or empty the text
        if (response.length > topic.review.length * 0.5) {
          topic.review = response.trim();
          modifiedCount++;
          console.log(`✅ Successfully highlighted ${topic.title}`);
        } else {
          console.error(`⚠️ Output for ${topic.title} seems unusually short, skipping rewrite.`);
        }
        
      } catch (err) {
        console.error(`❌ Failed to process ${topic.title}:`, err);
      }
      
      // Delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  if (modifiedCount > 0) {
    fs.writeFileSync(dataPath, JSON.stringify(knowledgeData, null, 2), 'utf8');
    
    // Also copy to reviewer directory so the frontend updates immediately
    const frontendPath = path.join(__dirname, '..', 'reviewer', 'reviewer-data.json');
    fs.writeFileSync(frontendPath, JSON.stringify(knowledgeData, null, 2), 'utf8');
    
    console.log(`\n🎉 Successfully highlighted key terms in ${modifiedCount} topics. Saved to output/ and reviewer/`);
  } else {
    console.log(`\nNo topics were modified.`);
  }
}

highlightTopicReviews().catch(console.error);
