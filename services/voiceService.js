const OpenAI = require('openai');
const fs = require('fs-extra');
const path = require('path');

class VoiceService {
    constructor() {
        console.log('VoiceService constructor - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 20) + '...' : 'NOT SET');
        console.log('VoiceService constructor - GITHUB_TOKEN:', process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.substring(0, 20) + '...' : 'NOT SET');
        console.log('🎭 VoiceService using voice:', this.voiceModel);
        
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        this.voiceSpeed = parseFloat(process.env.VOICE_SPEED) || 1.0;
        
        // Available OpenAI TTS voices
        this.availableVoices = [
            'alloy', 'ash', 'ballad', 'coral', 'echo', 
            'fable', 'nova', 'onyx', 'sage', 'shimmer'
        ];
        
        // Select random voice for this service instance
        this.voiceModel = this.selectRandomVoice();
    }

    selectRandomVoice() {
        // Check if a specific voice is requested via environment variable
        if (process.env.VOICE_MODEL && this.availableVoices.includes(process.env.VOICE_MODEL)) {
            return process.env.VOICE_MODEL;
        }
        
        // Otherwise, select a random voice
        const randomIndex = Math.floor(Math.random() * this.availableVoices.length);
        return this.availableVoices[randomIndex];
    }

    /**
     * Convert text to speech using OpenAI Voice API
     * @param {string} text - Text to convert to speech
     * @param {string} sessionId - Session identifier
     * @returns {Promise<string>} - Path to the generated audio file
     */
    async textToSpeech(text, sessionId) {
        try {
            const speechFile = path.join(process.env.TEMP_DIR || './temp', `${sessionId}_${Date.now()}.mp3`);
            
            const mp3 = await this.openai.audio.speech.create({
                model: "gpt-4o-mini-tts",
                voice: this.voiceModel,
                input: text,
                speed: this.voiceSpeed
            });

            const buffer = Buffer.from(await mp3.arrayBuffer());
            await fs.writeFile(speechFile, buffer);
            
            return speechFile;
        } catch (error) {
            console.error('Text-to-speech error:', error);
            console.log('Falling back to text-only mode for testing');
            // For testing, return a dummy file path
            return `text-only:${text}`;
        }
    }

    /**
     * Convert speech to text using OpenAI Whisper API
     * @param {string} audioFilePath - Path to the audio file
     * @returns {Promise<string>} - Transcribed text
     */
    async speechToText(audioFilePath) {
        try {
            const transcription = await this.openai.audio.transcriptions.create({
                file: fs.createReadStream(audioFilePath),
                model: "whisper-1",
                response_format: "text"
            });

            return transcription;
        } catch (error) {
            console.error('Speech-to-text error:', error);
            console.log('Falling back to text-only mode for testing');
            // For testing, return a dummy transcription
            return "test input for demonstration";
        }
    }

    /**
     * Generate a natural response using OpenAI GPT
     * @param {string} userInput - User's transcribed input
     * @param {Object} context - Current conversation context
     * @returns {Promise<string>} - Generated response
     */
    async generateResponse(userInput, context) {
        try {
            const systemPrompt = this.buildSystemPrompt(context);
            
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: userInput
                    }
                ],
                temperature: 0.7,
                max_tokens: 500
            });

            return completion.choices[0].message.content;
        } catch (error) {
            console.error('Response generation error:', error);
            throw new Error('Failed to generate response');
        }
    }

    /**
     * Build system prompt based on current context
     * @param {Object} context - Current conversation context
     * @returns {string} - System prompt
     */
    buildSystemPrompt(context) {
        let prompt = `You are a professional prior authorization specialist for a health insurance company. 
        You are speaking with a healthcare provider who is requesting authorization for a medication.
        
        Current session information:
        - Member Name: ${context.memberName || 'Not provided'}
        - Date of Birth: ${context.dateOfBirth || 'Not provided'}
        - Drug Requested: ${context.drugName || 'Not provided'}
        - Current Step: ${context.currentStep || 'Initial greeting'}
        
        Your role is to:
        1. Be professional, courteous, and helpful
        2. Speak naturally as if you're having a real conversation
        3. Ask one question at a time
        4. Collect all necessary information
        5. Guide the provider through the authorization process
        
        Current question: ${context.currentQuestion || 'Initial greeting'}
        
        If this is the initial greeting, introduce yourself and ask for the member's name, date of birth, and the drug being requested.
        
        If you're in the middle of a question flow, ask the current question and wait for the provider's response.
        
        Keep your responses concise and natural. Don't be robotic - speak like a real person having a conversation.`;

        if (context.currentQuestion && context.questionOptions) {
            prompt += `\n\nAvailable options for the current question: ${context.questionOptions.join(', ')}`;
        }

        return prompt;
    }

    /**
     * Clean up temporary audio files
     * @param {string} sessionId - Session identifier
     */
    async cleanupSessionFiles(sessionId) {
        try {
            const tempDir = process.env.TEMP_DIR || './temp';
            const files = await fs.readdir(tempDir);
            
            for (const file of files) {
                if (file.startsWith(sessionId)) {
                    await fs.remove(path.join(tempDir, file));
                }
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }
}

module.exports = new VoiceService(); 