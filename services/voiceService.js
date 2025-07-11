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
     * Convert text to speech using OpenAI Voice API with SSML support
     * @param {string} text - Text to convert to speech
     * @param {string} sessionId - Session identifier
     * @returns {Promise<string>} - Path to the generated audio file
     */
    async textToSpeech(text, sessionId) {
        try {
            const speechFile = path.join(process.env.TEMP_DIR || './temp', `${sessionId}_${Date.now()}.mp3`);
            
            // Convert text to SSML for better speech synthesis
            const ssmlText = this.convertToSSML(text);
            
            const mp3 = await this.openai.audio.speech.create({
                model: "gpt-4o-mini-tts",
                voice: this.voiceModel,
                input: ssmlText,
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
     * Convert text to SSML for natural speech synthesis
     * @param {string} text - Raw text
     * @returns {string} - SSML formatted text
     */
    convertToSSML(text) {
        // Add pauses for natural speech
        let ssmlText = text.replace(/\./g, '.<break time="300ms"/>');
        ssmlText = ssmlText.replace(/,/g, ',<break time="200ms"/>');
        ssmlText = ssmlText.replace(/:/g, ':<break time="400ms"/>');
        
        // Add pauses for discourse markers
        ssmlText = ssmlText.replace(/(Sure,|Okay,|Got it,|Right,|Alright,)/g, '<break time="200ms"/>$1<break time="200ms"/>');
        
        // Emphasize important medical terms and drug names
        const medicalTerms = [
            'prior authorization', 'diagnosis', 'medication', 'prescription',
            'coverage', 'approval', 'denial', 'criteria', 'patient'
        ];
        
        medicalTerms.forEach(term => {
            const regex = new RegExp(`\\b${term}\\b`, 'gi');
            ssmlText = ssmlText.replace(regex, `<emphasis>${term}</emphasis>`);
        });
        
        // Spell out drug names clearly
        const drugNames = [
            'Humira', 'Ozempic', 'Wegovy', 'Mounjaro', 'Stelara', 'Skyrizi', 
            'Dupixent', 'Rinvoq', 'Xeljanz', 'Cosentyx', 'Taltz', 'Tremfya'
        ];
        
        drugNames.forEach(drug => {
            const regex = new RegExp(`\\b${drug}\\b`, 'gi');
            ssmlText = ssmlText.replace(regex, `<say-as interpret-as="spell-out">${drug}</say-as>`);
        });
        
        // Add emphasis to key information
        ssmlText = ssmlText.replace(/(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b)/g, (match) => {
            // Don't emphasize discourse markers or common words
            const commonWords = ['Sure', 'Okay', 'Got', 'Right', 'Alright', 'Let', 'Give', 'Thanks'];
            if (commonWords.some(word => match.includes(word))) {
                return match;
            }
            return `<emphasis>${match}</emphasis>`;
        });
        
        return `<speak>${ssmlText}</speak>`;
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

            let response = completion.choices[0].message.content;
            
            // Add natural language patterns
            response = this.addNaturalLanguagePatterns(response, context);
            
            return response;
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
        let prompt = `You are Casey, a friendly and helpful prior authorization specialist for CVS Health. 

PERSONALITY:
- Speak clearly, concisely, and empathetically
- Use contractions naturally ("you're", "that's", "let's")
- Add discourse markers ("Sure,", "Okay,", "Got it.")
- Use occasional filler words ("Hmm,", "Let me check on that,") but sparingly
- Maintain clinical but compassionate tone

RESPONSE GUIDELINES:
- Keep confirmations under 1 sentence
- Use plain language, avoid jargon unless user uses it first
- Always repeat back key information: drug name, diagnosis, patient details
- Use backchannel cues: "I see.", "Thanks for that.", "Okay..."
- Summarize periodically: "So you're requesting [drug] for [diagnosis], correct?"

HEALTHCARE SPECIFIC:
- Be explicit with status updates
- Always confirm patient details before proceeding
- Use clear, professional language for medical terms

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
     * Add natural language patterns to responses
     * @param {string} response - Raw response text
     * @param {Object} context - Response context
     * @returns {string} - Enhanced response with natural patterns
     */
    addNaturalLanguagePatterns(response, context) {
        const discourseMarkers = ['Sure,', 'Okay,', 'Got it.', 'Right,', 'Alright,'];
        const backchannelCues = ['I see.', 'Thanks for that.', 'Understood.', 'Got it.'];
        const fillerPhrases = ['Let me check on that.', 'Hmm,', 'Give me a sec...'];
        
        // Add discourse marker at start (30% chance for non-confirmations)
        if (Math.random() < 0.3 && !response.startsWith('Sure') && !response.startsWith('Okay') && !context.isConfirmation) {
            response = discourseMarkers[Math.floor(Math.random() * discourseMarkers.length)] + ' ' + response;
        }
        
        // Add backchannel cue for confirmations
        if (context.isConfirmation) {
            response = backchannelCues[Math.floor(Math.random() * backchannelCues.length)] + ' ' + response;
        }
        
        // Add personality touches based on context
        if (context.action === 'complete') {
            const wrapUpPhrases = ['You\'ve got it. Let me just wrap that up.', 'Perfect. Just finishing up here.'];
            response = wrapUpPhrases[Math.floor(Math.random() * wrapUpPhrases.length)] + ' ' + response;
        }
        
        if (context.action === 'checking') {
            const checkingPhrases = ['Give me a sec to confirm coverage...', 'Let me check on that for you...'];
            response = checkingPhrases[Math.floor(Math.random() * checkingPhrases.length)] + ' ' + response;
        }
        
        return response;
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