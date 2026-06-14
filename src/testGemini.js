import { generateAIResponse } from './ai/gemini.js';

console.log('=== TESTING GROQ CONNECTION ===');

const testPrompt = 'Sapa diri kamu dalam bahasa Indonesia dan perkenalkan dirimu sebagai asisten WA bot yang ramah!';

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
