const OpenAI = require('openai');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

// Import the session service to use the same question sets
const sessionService = require('./services/sessionService');
const authService = require('./services/authService');

class VoiceAgent {
    constructor() {
        // Load environment variables manually to override shell environment
        this.loadEnvFile();
        
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        this.voiceSpeed = parseFloat(process.env.VOICE_SPEED) || 1.0;
        
        // Available OpenAI TTS voices
        this.availableVoices = [
            'alloy', 'ash', 'ballad', 'coral', 'echo', 
            'fable', 'nova', 'onyx', 'sage', 'shimmer'
        ];
        
        // Select random voice for this session
        this.voiceModel = this.selectRandomVoice();
        this.tempDir = process.env.TEMP_DIR || './temp';
        
        // Ensure temp directory exists
        fs.ensureDirSync(this.tempDir);
        
        // Initialize services
        this.sessionService = sessionService;
        this.authService = authService;
        
        this.conversationHistory = [];
        this.sessionId = null;
        
        // Performance optimizations
        this.enableStreamingTTS = process.env.ENABLE_STREAMING_TTS !== 'false'; // Default: true
        this.maxRecordingTime = parseInt(process.env.MAX_RECORDING_TIME) || 10; // Default: 10 seconds (increased from 5)
        this.enableParallelProcessing = process.env.ENABLE_PARALLEL_PROCESSING !== 'false'; // Default: true
        this.responseCache = new Map(); // Cache common responses
        this.shouldPreloadResponses = process.env.PRELOAD_RESPONSES !== 'false'; // Default: true
        
        console.log('🎤 Voice Agent initialized');
        console.log(`🎭 Voice Model: ${this.voiceModel} (randomly selected)`);
        console.log(`Voice Speed: ${this.voiceSpeed}`);
        console.log(`Streaming TTS: ${this.enableStreamingTTS ? 'Enabled' : 'Disabled'}`);
        console.log(`Max Recording Time: ${this.maxRecordingTime}s`);
        console.log('Press Ctrl+C to exit\n');
        
        // Pre-generate common responses if enabled
        if (this.shouldPreloadResponses) {
            // Call preloadCommonResponses asynchronously in the start method instead
            // to avoid blocking the constructor
        }
    }

    loadEnvFile() {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const envLines = envContent.split('\n');
            
            envLines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('#')) {
                    const [key, ...valueParts] = line.split('=');
                    if (key && valueParts.length > 0) {
                        const value = valueParts.join('=').trim();
                        process.env[key.trim()] = value;
                    }
                }
            });
        }
    }

    selectRandomVoice() {
        console.log(`🔍 Voice selection debug:`);
        console.log(`  - VOICE_MODEL env var: "${process.env.VOICE_MODEL}"`);
        console.log(`  - Available voices: ${this.availableVoices.join(', ')}`);
        
        // Check if a specific voice is requested via environment variable
        if (process.env.VOICE_MODEL && this.availableVoices.includes(process.env.VOICE_MODEL)) {
            console.log(`  - Using environment-specified voice: ${process.env.VOICE_MODEL}`);
            return process.env.VOICE_MODEL;
        }
        
        // Otherwise, select a random voice
        const randomIndex = Math.floor(Math.random() * this.availableVoices.length);
        const selectedVoice = this.availableVoices[randomIndex];
        console.log(`  - Using randomly selected voice: ${selectedVoice} (index: ${randomIndex})`);
        return selectedVoice;
    }

    async start() {
        // Wait for session service to load data
        console.log('🔄 Loading question sets and drug data...');
        while (!this.sessionService.dataLoaded) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log('✅ Data loaded successfully');
        
        // Pre-generate common responses if enabled
        if (this.shouldPreloadResponses) {
            await this.preloadCommonResponses();
        }
        
        // Create a new session
        this.sessionId = this.sessionService.createSession();
        console.log(`📋 Session created: ${this.sessionId}`);
        
        console.log('🎤 Starting Voice Agent...');
        console.log('Say "Hello" to begin the conversation');
        console.log('Say "Goodbye" to end the session\n');
        
        // Start with a greeting
        await this.speak("Hello! I'm your prior authorization assistant. I'm here to help you with your medication authorization request. To get started, I'll need some basic information about the patient and the medication. Could you please provide the patient's full name?");
        
        // Start listening for voice input
        await this.listenForVoice();
    }

    async listenForVoice() {
        try {
            console.log('🎤 Listening... (speak now - you have up to 10 seconds)');
            
            // Record audio using system command
            const audioFile = await this.recordAudio();
            
            if (audioFile) {
                console.log('🔄 Processing your speech...');
                
                // Convert speech to text
                const text = await this.speechToText(audioFile);
                
                if (text && text.trim()) {
                    console.log(`🎤 Transcribed: "${text}"`);
                    
                    // Check for exit command
                    if (text.toLowerCase().includes('goodbye') || text.toLowerCase().includes('exit')) {
                        await this.speak("Thank you for using our service. Have a great day!");
                        console.log('👋 Goodbye!');
                        process.exit(0);
                    }
                    
                    // Check for help command
                    if (text.toLowerCase().includes('help') || text.toLowerCase().includes('commands')) {
                        await this.speak("Here are the available commands: Say 'generate report' to create an authorization report, or 'goodbye' to end the session.");
                        setTimeout(() => this.listenForVoice(), 1000);
                        return;
                    }
                    
                    // Check for report generation command
                    if (text.toLowerCase().includes('report') || text.toLowerCase().includes('generate report')) {
                        const report = this.authService.generateReport(this.sessionId);
                        const reportPath = path.join(this.tempDir, `auth-report-${this.sessionId}.json`);
                        
                        try {
                            await fs.writeJson(reportPath, report, { spaces: 2 });
                            console.log(`📋 Authorization report saved: ${reportPath}`);
                            await this.speak(`I've generated a detailed authorization report for you. You can find it at: ${reportPath}`);
                        } catch (error) {
                            console.error('Error saving report:', error.message);
                            await this.speak("I'm sorry, but I encountered an error while generating the report.");
                        }
                        setTimeout(() => this.listenForVoice(), 1000);
                        return;
                    }
                    
                    // Process the input using the session service
                    const response = await this.processInputOptimized(text);
                    console.log(`🤖 Assistant: "${response}"`);
                    
                    // Display current session state for debugging
                    this.displaySessionState();
                    
                    // Use optimized TTS for faster response
                    if (this.enableStreamingTTS) {
                        // Start TTS playback and wait for it to complete
                        await this.speakOptimized(response);
                        // Wait a bit longer to ensure audio playback is complete and avoid echo
                        console.log('⏳ Waiting for audio to complete...');
                        setTimeout(() => this.listenForVoice(), 2500);
                    } else {
                        // Traditional blocking TTS
                        await this.speak(response);
                        // Continue listening after TTS finishes
                        setTimeout(() => this.listenForVoice(), 1000);
                    }
                } else {
                    console.log('❌ Could not understand speech. Please try again.');
                    setTimeout(() => this.listenForVoice(), 1000);
                }
            } else {
                console.log('❌ Failed to record audio. Please try again.');
                setTimeout(() => this.listenForVoice(), 1000);
            }
        } catch (error) {
            console.error('❌ Error in voice processing:', error.message);
            if (error.message.includes('too small')) {
                console.log('💡 Tip: Try speaking louder or for a longer duration');
            } else if (error.message.includes('Failed to record')) {
                console.log('💡 Tip: Make sure your microphone is working and not muted');
            }
            setTimeout(() => this.listenForVoice(), 1000);
        }
    }

    async recordAudio() {
        return new Promise((resolve, reject) => {
            const audioFile = path.join(this.tempDir, `${this.sessionId}_input_${Date.now()}.wav`);
            
            // Use sox to record audio (cross-platform) with very lenient silence detection
            const sox = spawn('sox', [
                '-d', // Use default input device
                audioFile,
                'trim', '0', this.maxRecordingTime.toString(), // Record for maxRecordingTime seconds
                'silence', '1', '0.1', '10%', '1', '3.0', '10%' // Stop on silence (3.0s of silence at 10% threshold)
            ]);
            
            let hasOutput = false;
            
            sox.stdout.on('data', (data) => {
                hasOutput = true;
            });
            
            sox.stderr.on('data', (data) => {
                // sox writes to stderr for status info
                hasOutput = true;
            });
            
            sox.on('close', (code) => {
                if (code === 0 && hasOutput && fs.existsSync(audioFile)) {
                    // Check file size to ensure it's not too small
                    const stats = fs.statSync(audioFile);
                    if (stats.size < 1000) { // Less than 1KB is probably too small
                        reject(new Error('Audio file too small - please speak louder or longer'));
                    } else {
                        resolve(audioFile);
                    }
                } else {
                    reject(new Error('Failed to record audio - please try again'));
                }
            });
            
            sox.on('error', (error) => {
                reject(new Error(`Sox not found. Please install sox: brew install sox (macOS) or apt-get install sox (Linux)`));
            });
        });
    }

    async speechToText(audioFilePath) {
        try {
            const transcription = await this.openai.audio.transcriptions.create({
                file: fs.createReadStream(audioFilePath),
                model: "whisper-1",
                response_format: "text"
            });

            // Clean up audio file
            await fs.remove(audioFilePath);
            
            return transcription;
        } catch (error) {
            console.error('Speech-to-text error:', error.message);
            // Clean up audio file even on error
            await fs.remove(audioFilePath).catch(() => {});
            return null;
        }
    }



    async processInputOptimized(userInput) {
        const session = this.sessionService.getSession(this.sessionId);
        if (!session) {
            return "I'm sorry, but I'm having trouble with your session. Let me start over.";
        }

        // Start processing immediately without waiting for previous operations
        const processingPromise = this.processInputInternal(userInput, session);
        
        // Return the promise - the calling code can await it if needed
        return processingPromise;
    }

    async processInputInternal(userInput, session) {
        // Process based on current step
        if (session.step === 'greeting') {
            return await this.processGreetingStep(userInput);
        } else if (session.step === 'question_flow') {
            return await this.processQuestionStep(userInput);
        } else if (session.step === 'complete') {
            return "Your authorization request has been processed. Is there anything else I can help you with?";
        } else {
            return "I'm sorry, but I'm not sure how to proceed. Let me transfer you to a human representative.";
        }
    }

    async extractInformationWithLLM(userInput, session) {
        try {
            const systemPrompt = `You are an AI assistant that extracts specific information from user input for a prior authorization system. 

Extract ONLY the following information if present in the user's input:
- memberName: The patient's full name (first and last name)
- dateOfBirth: The patient's date of birth in MM/DD/YYYY format
- drugName: The name of the medication being requested

Rules:
1. Only extract information that is explicitly mentioned or clearly implied
2. For dates, be VERY flexible and convert to MM/DD/YYYY format:
   - Accept formats like "January 15, 1985", "1/15/85", "01-15-1985", "born in 1985", etc.
   - For partial dates like "1985", use "01/01/1985"
   - For "born in 1985", use "01/01/1985"
3. For drug names, use the most specific/complete name mentioned
4. If information is not present, set the field to null
5. Be flexible with how people express information (e.g., "born on", "DOB", "patient is", etc.)

Return ONLY a valid JSON object with these exact field names:
{
  "memberName": "string or null",
  "dateOfBirth": "string in MM/DD/YYYY format or null", 
  "drugName": "string or null"
}`;

            const userPrompt = `Extract information from this user input: "${userInput}"

Current session state:
- memberName: ${session.memberName || 'not provided'}
- dateOfBirth: ${session.dateOfBirth || 'not provided'}
- drugName: ${session.drugName || 'not provided'}

What information can you extract from the user's input?`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.1,
                max_tokens: 200
            });

            const content = response.choices[0].message.content.trim();
            
            // Try to parse the JSON response
            try {
                const extractedInfo = JSON.parse(content);
                console.log(`🤖 LLM extracted info:`, extractedInfo);
                
                // Add fallback pattern matching for dates if LLM didn't find one
                if (!extractedInfo.dateOfBirth && !session.dateOfBirth) {
                    const fallbackDate = this.extractDateFallback(userInput);
                    if (fallbackDate) {
                        extractedInfo.dateOfBirth = fallbackDate;
                        console.log(`🔧 Fallback date extraction: "${userInput}" -> "${fallbackDate}"`);
                    }
                }
                
                return extractedInfo;
            } catch (parseError) {
                console.error('Failed to parse LLM response as JSON:', content);
                console.error('Parse error:', parseError.message);
                
                // Try fallback extraction
                const fallbackInfo = this.extractInformationFallback(userInput, session);
                console.log(`🔧 Fallback extraction:`, fallbackInfo);
                return fallbackInfo;
            }

        } catch (error) {
            console.error('LLM extraction error:', error.message);
            
            // Try fallback extraction
            const fallbackInfo = this.extractInformationFallback(userInput, session);
            console.log(`🔧 Fallback extraction:`, fallbackInfo);
            return fallbackInfo;
        }
    }

    extractDateFallback(userInput) {
        const input = userInput.toLowerCase();
        
        // Pattern 1: MM/DD/YYYY or MM-DD-YYYY
        const datePattern1 = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
        const match1 = input.match(datePattern1);
        if (match1) {
            const month = match1[1].padStart(2, '0');
            const day = match1[2].padStart(2, '0');
            const year = match1[3];
            return `${month}/${day}/${year}`;
        }
        
        // Pattern 2: MM/DD/YY or MM-DD-YY
        const datePattern2 = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/;
        const match2 = input.match(datePattern2);
        if (match2) {
            const month = match2[1].padStart(2, '0');
            const day = match2[2].padStart(2, '0');
            const year = '20' + match2[3]; // Assume 20xx
            return `${month}/${day}/${year}`;
        }
        
        // Pattern 3: "born in YYYY" or "YYYY"
        const yearPattern = /(?:born\s+in\s+)?(\d{4})/;
        const yearMatch = input.match(yearPattern);
        if (yearMatch) {
            return `01/01/${yearMatch[1]}`;
        }
        
        // Pattern 4: Month names
        const months = {
            'january': '01', 'jan': '01',
            'february': '02', 'feb': '02',
            'march': '03', 'mar': '03',
            'april': '04', 'apr': '04',
            'may': '05',
            'june': '06', 'jun': '06',
            'july': '07', 'jul': '07',
            'august': '08', 'aug': '08',
            'september': '09', 'sep': '09', 'sept': '09',
            'october': '10', 'oct': '10',
            'november': '11', 'nov': '11',
            'december': '12', 'dec': '12'
        };
        
        for (const [monthName, monthNum] of Object.entries(months)) {
            if (input.includes(monthName)) {
                // Look for day and year
                const dayMatch = input.match(/(\d{1,2})(?:st|nd|rd|th)?/);
                const yearMatch = input.match(/(\d{4})/);
                
                if (dayMatch && yearMatch) {
                    const day = dayMatch[1].padStart(2, '0');
                    return `${monthNum}/${day}/${yearMatch[1]}`;
                } else if (yearMatch) {
                    return `${monthNum}/01/${yearMatch[1]}`;
                }
            }
        }
        
        return null;
    }

    extractInformationFallback(userInput, session) {
        const result = {
            memberName: null,
            dateOfBirth: null,
            drugName: null
        };
        
        // Extract name if not already provided
        if (!session.memberName) {
            const nameMatch = userInput.match(/(?:name\s+is|called|patient\s+is)\s+([A-Za-z\s]+)/i);
            if (nameMatch) {
                result.memberName = nameMatch[1].trim();
            }
        }
        
        // Extract date of birth if not already provided
        if (!session.dateOfBirth) {
            result.dateOfBirth = this.extractDateFallback(userInput);
        }
        
        // Extract drug name if not already provided
        if (!session.drugName) {
            const drugMatch = userInput.match(/(?:drug|medication|prescribing|requesting)\s+([A-Za-z\s]+)/i);
            if (drugMatch) {
                result.drugName = drugMatch[1].trim();
            }
        }
        
        return result;
    }

    async processGreetingStep(userInput) {
        const session = this.sessionService.getSession(this.sessionId);
        
        console.log(`🔍 Processing input: "${userInput}"`);
        console.log(`🔍 Current session state: memberName=${session.memberName}, dateOfBirth=${session.dateOfBirth}, drugName=${session.drugName}`);
        
        // Use LLM to extract information
        const extractedInfo = await this.extractInformationWithLLM(userInput, session);
        
        // Update session with extracted information
        if (Object.keys(extractedInfo).length > 0) {
            // Only update fields that were actually extracted (not null)
            const updates = {};
            if (extractedInfo.memberName) updates.memberName = extractedInfo.memberName;
            if (extractedInfo.dateOfBirth) updates.dateOfBirth = extractedInfo.dateOfBirth;
            if (extractedInfo.drugName) updates.drugName = extractedInfo.drugName;
            
            if (Object.keys(updates).length > 0) {
                console.log(`✅ Updating session with:`, updates);
                this.sessionService.updateSession(this.sessionId, updates);
            }
        }
        
        // Get updated session after potential updates
        const updatedSession = this.sessionService.getSession(this.sessionId);
        
        // Determine next question based on what's missing
        if (!updatedSession.memberName) {
            return "I didn't catch the patient's name. Could you please provide the patient's full name? You can say something like 'The patient's name is John Smith' or 'Patient name is Jane Doe'.";
        }
        
        if (!updatedSession.dateOfBirth) {
            return "Thank you. Now I need the patient's date of birth. You can say it in any format, such as 'January 15, 1985', '1/15/85', or 'born in 1985'. What is the patient's date of birth?";
        }
        
        if (!updatedSession.drugName) {
            return "Thank you. What medication are you requesting authorization for? Please provide the medication name.";
        }
        
        // All basic info collected, find the drug and start question flow
        const drugMatch = this.sessionService.findDrugWithConfidence(updatedSession.drugName);
        
        if (!drugMatch.drug) {
            let response = `I'm sorry, but I don't recognize "${updatedSession.drugName}" in our system.`;
            
            if (drugMatch.alternatives.length > 0) {
                response += ` Did you mean one of these medications: ${drugMatch.alternatives.map(alt => alt.name).join(', ')}?`;
            } else {
                response += ` Could you please provide the exact name of the medication you're requesting? You can also try using the generic name if available.`;
            }
            
            return response;
        }
        
        // If confidence is low, ask for confirmation
        if (drugMatch.confidence < 0.8) {
            return `I think you're requesting ${drugMatch.drug.name}. Is that correct? If not, please provide the exact medication name.`;
        }
        
        const drug = drugMatch.drug;
        
        // Initialize question flow
        this.sessionService.initializeQuestionFlow(this.sessionId, drug.id);
        this.sessionService.updateSession(this.sessionId, { drugName: drug.name });
        
        const currentQuestion = this.sessionService.getCurrentQuestion(this.sessionId);
        
        return `Thank you. I found ${drug.name} in our system. Now I need to ask you some clinical questions to process this authorization. ${currentQuestion.text}`;
    }

    async processAnswerWithLLM(userInput, currentQuestion) {
        try {
            const systemPrompt = `You are an AI assistant that processes user responses to medical authorization questions. 

Your task is to interpret the user's response and determine the appropriate answer based on the question type.

Question types:
- yes_no: User must answer yes/no or y/n
- multiple_choice: User must select from specific options
- numeric: User must provide a number

Rules:
1. Be flexible with how people express answers
2. For yes/no questions, accept variations like "yeah", "sure", "nope", "not really", etc.
3. For multiple choice, try to match the user's response to the closest option
4. For numeric questions, extract the number even if surrounded by text
5. If the response is unclear, return "unclear"

Return ONLY a valid JSON object:
{
  "answer": "the processed answer",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of how you interpreted the response"
}`;

            const userPrompt = `Question: ${currentQuestion.text}
Question Type: ${currentQuestion.type}
Question Options: ${currentQuestion.options ? JSON.stringify(currentQuestion.options) : 'N/A'}

User Response: "${userInput}"

What is the processed answer?`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.1,
                max_tokens: 200
            });

            const content = response.choices[0].message.content.trim();
            
            try {
                const result = JSON.parse(content);
                console.log(`🤖 LLM processed answer:`, result);
                return result;
            } catch (parseError) {
                console.error('Failed to parse LLM response as JSON:', content);
                return { answer: userInput, confidence: 0.5, reasoning: 'Fallback to original input' };
            }

        } catch (error) {
            console.error('LLM answer processing error:', error.message);
            return { answer: userInput, confidence: 0.5, reasoning: 'Error occurred, using original input' };
        }
    }

    async processQuestionStep(userInput) {
        const session = this.sessionService.getSession(this.sessionId);
        const currentQuestion = this.sessionService.getCurrentQuestion(this.sessionId);
        
        console.log(`🔍 Processing question answer: "${userInput}"`);
        console.log(`🔍 Current question: ${currentQuestion?.text}`);
        
        // Use LLM to process the answer if available
        let processedAnswer = userInput;
        let confidence = 1.0;
        
        if (currentQuestion) {
            const llmResult = await this.processAnswerWithLLM(userInput, currentQuestion);
            processedAnswer = llmResult.answer;
            confidence = llmResult.confidence;
            
            console.log(`🤖 LLM processed: "${userInput}" -> "${processedAnswer}" (confidence: ${confidence})`);
            
            // If confidence is low, ask for clarification
            if (confidence < 0.7) {
                return `I'm not sure I understood your response. Could you please clarify: ${currentQuestion.text}`;
            }
        }
        
        const result = this.sessionService.processAnswer(this.sessionId, processedAnswer);
        
        if (result.action === 'complete') {
            // Process the final decision
            const decision = this.authService.processDecision(this.sessionId, result.decision, result.reason);
            
            // Generate report
            const report = this.authService.generateReport(this.sessionId);
            const reportPath = path.join(this.tempDir, `auth-report-${this.sessionId}.json`);
            
            try {
                await fs.writeJson(reportPath, report, { spaces: 2 });
                console.log(`📋 Authorization report saved: ${reportPath}`);
            } catch (error) {
                console.error('Error saving report:', error.message);
            }
            
            let response = "";
            
            if (result.decision === 'approve') {
                response = "Based on the information provided, I'm pleased to inform you that your authorization request has been approved. The medication will be covered according to your plan's formulary.";
            } else if (result.decision === 'deny') {
                response = `I'm sorry, but I must deny this authorization request. ${result.reason || 'The clinical criteria for this medication have not been met.'}`;
            } else if (result.decision === 'documentation_required') {
                response = "I need additional clinical documentation to process this authorization. Please submit the required documentation through our provider portal or fax system.";
            }
            
            response += ` I've generated a detailed authorization report that you can find at: ${reportPath}`;
            
            return response;
        } else if (result.action === 'next_question') {
            if (result.question) {
                return result.question.text;
            } else {
                return "I've completed all the necessary questions. Let me process your authorization request.";
            }
        } else {
            return "I'm sorry, I didn't understand your response. Could you please repeat that?";
        }
    }

    async speak(text) {
        try {
            const speechFile = path.join(this.tempDir, `${this.sessionId}_output_${Date.now()}.mp3`);
            
            const mp3 = await this.openai.audio.speech.create({
                model: "gpt-4o-mini-tts",
                voice: this.voiceModel,
                input: text,
                speed: this.voiceSpeed
            });

            const buffer = Buffer.from(await mp3.arrayBuffer());
            await fs.writeFile(speechFile, buffer);
            
            // Play the audio file
            await this.playAudio(speechFile);
            
            // Clean up the audio file
            await fs.remove(speechFile);
            
        } catch (error) {
            console.error('Text-to-speech error:', error.message);
            console.log('Falling back to text-only mode');
        }
    }

    async speakStreaming(text) {
        try {
            const speechFile = path.join(this.tempDir, `${this.sessionId}_output_${Date.now()}.mp3`);
            
            // Start TTS generation
            const mp3 = await this.openai.audio.speech.create({
                model: "gpt-4o-mini-tts",
                voice: this.voiceModel,
                input: text,
                speed: this.voiceSpeed
            });

            const buffer = Buffer.from(await mp3.arrayBuffer());
            await fs.writeFile(speechFile, buffer);
            
            // Start playing immediately while we continue processing
            this.playAudio(speechFile).then(() => {
                // Clean up after playback
                fs.remove(speechFile).catch(() => {});
            }).catch((error) => {
                console.error('Audio playback error:', error.message);
                fs.remove(speechFile).catch(() => {});
            });
            
            // Don't wait for audio to finish - return immediately
            return true;
            
        } catch (error) {
            console.error('Text-to-speech error:', error.message);
            console.log('Falling back to text-only mode');
            return false;
        }
    }

    async playAudio(audioFilePath) {
        return new Promise((resolve, reject) => {
            // Use afplay on macOS, aplay on Linux, or start on Windows
            let command, args;
            
            if (process.platform === 'darwin') {
                command = 'afplay';
                args = [audioFilePath];
            } else if (process.platform === 'linux') {
                command = 'aplay';
                args = [audioFilePath];
            } else if (process.platform === 'win32') {
                command = 'start';
                args = ['', audioFilePath];
            } else {
                reject(new Error('Unsupported platform for audio playback'));
                return;
            }
            
            const player = spawn(command, args);
            
            player.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Audio playback failed with code ${code}`));
                }
            });
            
            player.on('error', (error) => {
                reject(new Error(`Audio playback error: ${error.message}`));
            });
        });
    }

    async cleanup() {
        try {
            const files = await fs.readdir(this.tempDir);
            for (const file of files) {
                if (file.startsWith(this.sessionId)) {
                    await fs.remove(path.join(this.tempDir, file));
                }
            }
        } catch (error) {
            console.error('Cleanup error:', error.message);
        }
    }

    displaySessionState() {
        const session = this.sessionService.getSession(this.sessionId);
        if (!session) return;
        
        console.log('\n📊 Current Session State:');
        console.log(`   Session ID: ${session.id}`);
        console.log(`   Step: ${session.step}`);
        console.log(`   Member Name: ${session.memberName || 'Not provided'}`);
        console.log(`   Date of Birth: ${session.dateOfBirth || 'Not provided'}`);
        console.log(`   Drug Name: ${session.drugName || 'Not provided'}`);
        
        if (session.step === 'question_flow') {
            const currentQuestion = this.sessionService.getCurrentQuestion(this.sessionId);
            console.log(`   Current Question: ${currentQuestion ? currentQuestion.text : 'None'}`);
            console.log(`   Questions Answered: ${Object.keys(session.answers).length}`);
        }
        
        console.log(''); // Empty line for readability
    }

    async preloadCommonResponses() {
        const commonResponses = [
            "I didn't catch the patient's name. Could you please provide the patient's full name?",
            "Thank you. Now I need the patient's date of birth. What is the patient's date of birth?",
            "Thank you. What medication are you requesting authorization for?",
            "I'm sorry, I didn't understand your response. Could you please repeat that?",
            "I've completed all the necessary questions. Let me process your authorization request."
        ];
        
        console.log('🔄 Pre-generating common responses...');
        
        for (const response of commonResponses) {
            try {
                const speechFile = path.join(this.tempDir, `preload_${Buffer.from(response).toString('base64').substring(0, 20)}.mp3`);
                
                const mp3 = await this.openai.audio.speech.create({
                    model: "gpt-4o-mini-tts",
                    voice: this.voiceModel,
                    input: response,
                    speed: this.voiceSpeed
                });

                const buffer = Buffer.from(await mp3.arrayBuffer());
                await fs.writeFile(speechFile, buffer);
                
                this.responseCache.set(response, speechFile);
            } catch (error) {
                console.error('Error pre-generating response:', error.message);
            }
        }
        
        console.log(`✅ Pre-generated ${this.responseCache.size} common responses`);
    }

    async speakOptimized(text) {
        // Check if we have a pre-generated response
        if (this.responseCache.has(text)) {
            const cachedFile = this.responseCache.get(text);
            if (fs.existsSync(cachedFile)) {
                console.log('🎵 Using cached audio response');
                // Wait for audio playback to complete
                await this.playAudio(cachedFile);
                return true;
            }
        }
        
        // Fall back to regular TTS (not streaming) to ensure proper timing
        return await this.speak(text);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down Voice Agent...');
    if (global.voiceAgent) {
        await global.voiceAgent.cleanup();
    }
    process.exit(0);
});

// Start the voice agent
async function main() {
    try {
        global.voiceAgent = new VoiceAgent();
        await global.voiceAgent.start();
    } catch (error) {
        console.error('❌ Failed to start Voice Agent:', error.message);
        process.exit(1);
    }
}

main(); 