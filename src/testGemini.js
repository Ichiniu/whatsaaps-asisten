import { generateAIResponse } from './ai/gemini.js';

console.log('=== TESTING GEMINI CONNECTION ===');

const testPrompt = 'Say a warm hello in Indonesian and introduce yourself as wbot assistant!';

generateAIResponse(testPrompt)
  .then((response) => {
    console.log('\nResponse from Gemini:');
    console.log(response);
    console.log('\n=== TEST SUCCESSFUL ===');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nTest failed:', err);
    process.exit(1);
  });
