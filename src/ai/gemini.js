import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

let genAI = null;
if (apiKey && apiKey !== 'your_gemini_api_key_here') {
  genAI = new GoogleGenerativeAI(apiKey);
}

/**
 * Mengirimkan prompt ke Gemini AI model (gemini-1.5-flash) dan mengembalikan respons teks.
 * @param {string} prompt - Prompt dari pengguna
 * @returns {Promise<string>} - Jawaban dari Gemini
 */
export async function generateAIResponse(prompt) {
  if (!genAI) {
    // Coba re-inisialisasi jika API key baru dikonfigurasi runtime
    const currentApiKey = process.env.GEMINI_API_KEY;
    if (currentApiKey && currentApiKey !== 'your_gemini_api_key_here') {
      genAI = new GoogleGenerativeAI(currentApiKey);
    } else {
      throw new Error('GEMINI_API_KEY belum dikonfigurasi dengan benar di file .env');
    }
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}
