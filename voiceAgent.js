const OpenAI = require('openai');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const WebSocket = require('ws');

// --- WebSocket Client for sending logs to the server ---
let ws;
function connectWebSocket() {
    ws = new WebSocket('ws://localhost:3000/ws');
    ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'info', message: 'Voice agent connected.' }));
    });
    ws.on('close', () => {
        setTimeout(connectWebSocket, 2000); // Reconnect after 2s
    });
    ws.on('error', () => {}); // Ignore errors
}
connectWebSocket();

function sendLogToWebUI(type, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, message }));
    }
}

// Patch console.log and console.error to also send to Web UI
const origLog = console.log;
const origErr = console.error;
console.log = function (...args) {
    origLog.apply(console, args);
    sendLogToWebUI('log', args.map(String).join(' '));
};
console.error = function (...args) {
    origErr.apply(console, args);
    sendLogToWebUI('error', args.map(String).join(' '));
};

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
        
        this.voiceSpeed = parseFloat(process.env.VOICE_SPEED) || 1.2; // Increased speed for faster responses
        
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
        
        // Performance optimizations - all enabled by default
        this.enableStreamingTTS = true; // Always enabled for better performance
        this.maxRecordingTime = parseInt(process.env.MAX_RECORDING_TIME) || 8; // Reduced from 10 to 8 seconds
        this.enableParallelProcessing = true; // Always enabled
        this.responseCache = new Map(); // Cache common responses
        this.shouldPreloadResponses = true; // Always enabled
        
        // Audio playback tracking
        this.currentAudioPlayer = null;
        this.isPlayingAudio = false;
        
        console.log('🎤 Voice Agent initialized (Optimized Mode)');
        console.log(`🎭 Voice Model: ${this.voiceModel} (randomly selected)`);
        console.log(`Voice Speed: ${this.voiceSpeed} (increased for faster responses)`);
        console.log(`Streaming TTS: ${this.enableStreamingTTS ? 'Enabled' : 'Disabled'}`);
        console.log(`Max Recording Time: ${this.maxRecordingTime}s (reduced for faster turn-taking)`);
        console.log('Press Ctrl+C to exit\n');
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
        console.log(`  - VOICE_MODEL env var: "${process.env.VOICE_MODEL}" (IGNORED)`);
        console.log(`  - Available voices: ${this.availableVoices.join(', ')}`);
        // Always select a random voice, ignore env var
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
        await this.speakOptimized("Hi thank you for contacting CVS Health I'm PAIGE your Prior Authorization Intake & Guidance Engine, Please state the patient name, birth date and medication you're requesting");
        
        // Start listening for voice input
        await this.listenForVoice();
    }

    async listenForVoice() {
        try {
            console.log('🎤 Listening... (speak now)');
            
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
                        await this.speakOptimized("Thank you for using our service. Have a great day!");
                        console.log('👋 Goodbye!');
                        process.exit(0);
                    }
                    
                    // Check for help command
                    if (text.toLowerCase().includes('help') || text.toLowerCase().includes('commands')) {
                        await this.speakOptimized("Here are the available commands: Say 'generate report' to create an authorization report, or 'goodbye' to end the session.");
                        // Reduced delay - start listening immediately
                        this.listenForVoice();
                        return;
                    }
                    
                    // Check for report generation command
                    if (text.toLowerCase().includes('report') || text.toLowerCase().includes('generate report')) {
                        const report = this.authService.generateReport(this.sessionId);
                        const reportPath = path.join(this.tempDir, `auth-report-${this.sessionId}.json`);
                        
                        try {
                            await fs.writeJson(reportPath, report, { spaces: 2 });
                            console.log(`📋 Authorization report saved: ${reportPath}`);
                            await this.speakOptimized(`I've generated a detailed authorization report for you. You can find it at: ${reportPath}`);
                        } catch (error) {
                            console.error('Error saving report:', error.message);
                            await this.speakOptimized("I'm sorry, but I encountered an error while generating the report.");
                        }
                        // Reduced delay - start listening immediately
                        this.listenForVoice();
                        return;
                    }
                    
                    // Process the input using the session service
                    const response = await this.processInputOptimized(text);
                    console.log(`🤖 Assistant: "${response}"`);
                    
                    // Display current session state for debugging
                    this.displaySessionState();
                    
                    // Use optimized TTS for faster response
                    await this.speakOptimized(response);
                    
                    // Reduced delay - start listening immediately after TTS starts
                    this.listenForVoice();
                } else {
                    console.log('❌ Could not understand speech. Please try again.');
                    await this.speakOptimized("I'm sorry, I didn't catch that. Could you please repeat what you said?");
                    // Reduced delay
                    setTimeout(() => this.listenForVoice(), 500);
                }
            } else {
                console.log('❌ Failed to record audio. Please try again.');
                await this.speakOptimized("I'm sorry, I couldn't record your audio. Could you please try speaking again?");
                // Reduced delay
                setTimeout(() => this.listenForVoice(), 500);
            }
        } catch (error) {
            console.error('❌ Error in voice processing:', error.message);
            if (error.message.includes('too small')) {
                console.log('💡 Tip: Try speaking louder or for a longer duration');
                await this.speakOptimized("I'm sorry, I didn't hear you clearly. Could you please speak a bit louder and repeat what you said?");
            } else if (error.message.includes('Failed to record')) {
                console.log('💡 Tip: Make sure your microphone is working and not muted');
                await this.speakOptimized("I'm sorry, I couldn't record your audio. Please check your microphone and try again.");
            } else {
                await this.speakOptimized("I'm sorry, I encountered an error. Could you please repeat what you said?");
            }
            // Reduced delay
            setTimeout(() => this.listenForVoice(), 500);
        }
    }

    async recordAudio() {
        return new Promise((resolve, reject) => {
            const audioFile = path.join(this.tempDir, `${this.sessionId}_input_${Date.now()}.wav`);
            
            // Use sox to record audio with optimized settings for faster turn-taking
            const sox = spawn('sox', [
                '-d', // Use default input device
                audioFile,
                'trim', '0', this.maxRecordingTime.toString(), // Record for maxRecordingTime seconds
                'silence', '1', '0.1', '3%', '1', '2.0', '3%' // Stop on silence (2.0s of silence at 3% threshold - even more sensitive)
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
                    if (stats.size < 300) { // Further reduced threshold - less than 300 bytes is probably too small
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
        // Enhanced date extraction patterns
        const datePatterns = [
            // MM/DD/YYYY or MM-DD-YYYY
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
            // Month DD, YYYY or Month DD YYYY
            /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})/i,
            // Born in YYYY
            /born\s+in\s+(\d{4})/i,
            // Just YYYY
            /\b(\d{4})\b/
        ];

        for (const pattern of datePatterns) {
            const match = userInput.match(pattern);
            if (match) {
                if (pattern.source.includes('born\\s+in')) {
                    // "born in 1985" -> "01/01/1985"
                    return `01/01/${match[1]}`;
                } else if (pattern.source.includes('\\b(\\d{4})\\b')) {
                    // Just year -> "01/01/YYYY"
                    const year = parseInt(match[1]);
                    if (year >= 1900 && year <= 2024) {
                        return `01/01/${match[1]}`;
                    }
                } else if (pattern.source.includes('january|february')) {
                    // Month name format
                    const monthNames = {
                        'january': '01', 'jan': '01', 'february': '02', 'feb': '02',
                        'march': '03', 'mar': '03', 'april': '04', 'apr': '04',
                        'may': '05', 'june': '06', 'jun': '06', 'july': '07', 'jul': '07',
                        'august': '08', 'aug': '08', 'september': '09', 'sep': '09',
                        'october': '10', 'oct': '10', 'november': '11', 'nov': '11',
                        'december': '12', 'dec': '12'
                    };
                    const month = monthNames[match[1].toLowerCase()];
                    const day = match[2].padStart(2, '0');
                    const year = match[3];
                    return `${month}/${day}/${year}`;
                } else {
                    // MM/DD/YYYY format
                    const month = match[1].padStart(2, '0');
                    const day = match[2].padStart(2, '0');
                    const year = match[3];
                    return `${month}/${day}/${year}`;
                }
            }
        }
        return null;
    }

    extractInformationFallback(userInput, session) {
        const extractedInfo = {
            memberName: null,
            dateOfBirth: null,
            drugName: null
        };

        // Simple name extraction (look for two consecutive capitalized words)
        const nameMatch = userInput.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
        if (nameMatch && !session.memberName) {
            extractedInfo.memberName = `${nameMatch[1]} ${nameMatch[2]}`;
        }

        // Date extraction using fallback
        if (!session.dateOfBirth) {
            const fallbackDate = this.extractDateFallback(userInput);
            if (fallbackDate) {
                extractedInfo.dateOfBirth = fallbackDate;
            }
        }

        // Simple drug name extraction (look for common medication keywords)
        const drugKeywords = ['humira', 'enbrel', 'xeljanz', 'remicade', 'cosentyx', 'stelara', 'otezla', 'simponi', 'taltz', 'orencia'];
        const lowerInput = userInput.toLowerCase();
        for (const drug of drugKeywords) {
            if (lowerInput.includes(drug) && !session.drugName) {
                extractedInfo.drugName = drug.charAt(0).toUpperCase() + drug.slice(1);
                break;
            }
        }

        return extractedInfo;
    }

    async processGreetingStep(userInput) {
        const session = this.sessionService.getSession(this.sessionId);
        if (!session) {
            return "I'm sorry, but I'm having trouble with your session. Let me start over.";
        }

        // Extract information from user input
        const extractedInfo = await this.extractInformationWithLLM(userInput, session);

        // Update session with extracted information
        let updated = false;
        if (extractedInfo.memberName && !session.memberName) {
            session.memberName = extractedInfo.memberName;
            updated = true;
        }
        if (extractedInfo.dateOfBirth && !session.dateOfBirth) {
            session.dateOfBirth = extractedInfo.dateOfBirth;
            updated = true;
        }
        if (extractedInfo.drugName && !session.drugName) {
            session.drugName = extractedInfo.drugName;
            updated = true;
        }

        // Determine what information is still needed
        const missingInfo = [];
        if (!session.memberName) missingInfo.push('patient name');
        if (!session.dateOfBirth) missingInfo.push('date of birth');
        if (!session.drugName) missingInfo.push('medication name');

        if (missingInfo.length === 0) {
            // All information collected, find the drug and start question flow
            const drugMatch = this.sessionService.findDrugWithConfidence(session.drugName);
            
            if (!drugMatch.drug) {
                let response = `I'm sorry, but I don't recognize "${session.drugName}" in our system.`;
                
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
        } else {
            // Still need more information
            const missingText = missingInfo.join(' and ');
            if (missingInfo.length === 1) {
                return `I still need the patient's ${missingText}. Could you please provide that?`;
            } else {
                return `I still need the patient's ${missingText}. Could you please provide this information?`;
            }
        }
    }

    async processAnswerWithLLM(userInput, currentQuestion) {
        try {
            const systemPrompt = `You are an AI assistant that helps process answers to medical questions for prior authorization requests.

Your task is to determine if the user's answer to a medical question is "Yes", "No", or "Unknown/Unclear".

Rules:
1. Look for clear affirmative words: yes, yep, yeah, sure, correct, right, true, positive, etc.
2. Look for clear negative words: no, nope, nah, not, negative, false, incorrect, wrong, etc.
3. If the answer is unclear, ambiguous, or the user says they don't know, return "Unknown"
4. Be flexible with how people express yes/no answers
5. Consider context and medical terminology

Return ONLY one word: "Yes", "No", or "Unknown"`;

            const userPrompt = `Question: "${currentQuestion.text}"

User's answer: "${userInput}"

What is the user's answer?`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.1,
                max_tokens: 10
            });

            const answer = response.choices[0].message.content.trim().toLowerCase();
            
            if (answer === 'yes') return 'Yes';
            if (answer === 'no') return 'No';
            return 'Unknown';
        } catch (error) {
            console.error('LLM answer processing error:', error.message);
            // Fallback to simple keyword matching
            const lowerInput = userInput.toLowerCase();
            if (lowerInput.includes('yes') || lowerInput.includes('yep') || lowerInput.includes('yeah') || lowerInput.includes('sure')) {
                return 'Yes';
            } else if (lowerInput.includes('no') || lowerInput.includes('nope') || lowerInput.includes('not')) {
                return 'No';
            } else {
                return 'Unknown';
            }
        }
    }

    makeDecisionFromAnswers(session) {
        // Get the drug and question set to understand the criteria
        const drug = this.sessionService.drugsData.drugs.find(d => d.id === session.drugId);
        if (!drug) {
            return { decision: 'deny', reason: 'Drug information not found' };
        }

        const questionSet = this.sessionService.getQuestionSet(drug.questionSet);
        if (!questionSet) {
            return { decision: 'deny', reason: 'Question set not found' };
        }

        // For Humira (biologic_anti_tnf), check the specific criteria
        if (drug.questionSet === 'biologic_anti_tnf') {
            return this.evaluateAntiTNFCriteria(session);
        }

        // Default decision logic
        return { decision: 'documentation_required', reason: 'Additional clinical documentation required for final decision' };
    }

    evaluateAntiTNFCriteria(session) {
        const answers = session.answers;
        
        // Check diagnosis
        if (answers.diagnosis) {
            const diagnosis = answers.diagnosis.toLowerCase();
            if (diagnosis.includes('other') || diagnosis.includes('unknown')) {
                return { decision: 'deny', reason: 'Diagnosis not covered under current authorization criteria' };
            }
        }

        // Check disease duration
        if (answers.disease_duration) {
            const duration = answers.disease_duration.toLowerCase();
            if (duration.includes('less than 6 months')) {
                return { decision: 'deny', reason: 'Disease duration less than 6 months - insufficient time for conventional therapy trial' };
            }
        }

        // Check psoriasis severity
        if (answers.psoriasis_severity) {
            const severity = answers.psoriasis_severity.toLowerCase();
            if (severity.includes('mild') || severity.includes('less than 3%')) {
                return { decision: 'deny', reason: 'Mild psoriasis - does not meet severity criteria for biologic therapy' };
            }
        }

        // Check conventional therapy
        if (answers.conventional_therapy === 'No') {
            return { decision: 'deny', reason: 'Patient has not tried conventional therapy as required' };
        }

        // Check infection screening
        if (answers.infection_screening === 'No') {
            return { decision: 'documentation_required', reason: 'Infection screening required before authorization' };
        }

        // Check infection results
        if (answers.infection_results) {
            const results = answers.infection_results.toLowerCase();
            if (results.includes('positive for tb') || results.includes('positive for other infections')) {
                return { decision: 'deny', reason: 'Positive infection screening - contraindication to biologic therapy' };
            }
            if (results.includes('pending')) {
                return { decision: 'documentation_required', reason: 'Pending infection screening results required' };
            }
        }

        // If we get here, the patient meets the criteria
        return { decision: 'approve', reason: 'Patient meets all clinical criteria for biologic therapy' };
    }

    async processQuestionStep(userInput) {
        const session = this.sessionService.getSession(this.sessionId);
        if (!session) {
            return "I'm sorry, but I'm having trouble with your session. Let me start over.";
        }

        const currentQuestion = this.sessionService.getCurrentQuestion(this.sessionId);
        if (!currentQuestion) {
            // No more questions, complete the session
            session.step = 'complete';
            this.sessionService.updateSession(this.sessionId, session);
            return "Thank you. I have all the information I need to process your authorization request. You can say 'generate report' to create a detailed authorization report.";
        }

        // Process the answer using LLM
        const answer = await this.processAnswerWithLLM(userInput, currentQuestion);
        
        // Process the answer using the session service
        const result = this.sessionService.processAnswer(this.sessionId, answer);
        
        if (result.action === 'complete') {
            // Process the final decision
            const decision = this.authService.processDecision(this.sessionId, result.decision, result.reason);
            
            // Generate report with user-friendly filename
            const report = this.authService.generateReport(this.sessionId);
            const patientName = session.memberName ? session.memberName.replace(/\s+/g, '_') : 'Unknown_Patient';
            const medication = session.drugName ? session.drugName.replace(/\s+/g, '_') : 'Unknown_Medication';
            const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            const reportPath = path.join(this.tempDir, `${patientName}_${medication}_${date}.json`);
            
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
                // No more questions but no decision reached - need to make a decision based on answers
                const session = this.sessionService.getSession(this.sessionId);
                const decision = this.makeDecisionFromAnswers(session);
                
                // Update session with decision
                session.decision = decision.decision;
                session.decisionReason = decision.reason;
                session.step = 'complete';
                this.sessionService.updateSession(this.sessionId, session);
                
                // Process the decision
                const decisionResult = this.authService.processDecision(this.sessionId, decision.decision, decision.reason);
                
                // Generate report with user-friendly filename
                const report = this.authService.generateReport(this.sessionId);
                const patientName = session.memberName ? session.memberName.replace(/\s+/g, '_') : 'Unknown_Patient';
                const medication = session.drugName ? session.drugName.replace(/\s+/g, '_') : 'Unknown_Medication';
                const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
                const reportPath = path.join(this.tempDir, `${patientName}_${medication}_${date}.json`);
                
                try {
                    await fs.writeJson(reportPath, report, { spaces: 2 });
                    console.log(`📋 Authorization report saved: ${reportPath}`);
                } catch (error) {
                    console.error('Error saving report:', error.message);
                }
                
                let response = "";
                
                if (decision.decision === 'approve') {
                    response = "Based on the information provided, I'm pleased to inform you that your authorization request has been approved. The medication will be covered according to your plan's formulary.";
                } else if (decision.decision === 'deny') {
                    response = `I'm sorry, but I must deny this authorization request. ${decision.reason || 'The clinical criteria for this medication have not been met.'}`;
                } else if (decision.decision === 'documentation_required') {
                    response = "I need additional clinical documentation to process this authorization. Please submit the required documentation through our provider portal or fax system.";
                }
                
                response += ` I've generated a detailed authorization report that you can find at: ${reportPath}`;
                
                return response;
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

    async playAudio(audioFilePath) {
        return new Promise((resolve, reject) => {
            // Stop any currently playing audio
            if (this.currentAudioPlayer) {
                this.currentAudioPlayer.kill();
                this.currentAudioPlayer = null;
            }
            
            this.isPlayingAudio = true;
            
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
            
            this.currentAudioPlayer = spawn(command, args);
            
            this.currentAudioPlayer.on('close', (code) => {
                this.isPlayingAudio = false;
                this.currentAudioPlayer = null;
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Audio playback failed with code ${code}`));
                }
            });
            
            this.currentAudioPlayer.on('error', (error) => {
                this.isPlayingAudio = false;
                this.currentAudioPlayer = null;
                reject(new Error(`Audio playback error: ${error.message}`));
            });
        });
    }

    async cleanup() {
        try {
            // Stop any playing audio
            if (this.currentAudioPlayer) {
                this.currentAudioPlayer.kill();
                this.currentAudioPlayer = null;
            }
            
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
        
        // Use streaming TTS for faster response
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
            
            // Start playing immediately
            await this.playAudio(speechFile);
            
            // Clean up after playback
            await fs.remove(speechFile);
            
            return true;
        } catch (error) {
            console.error('Text-to-speech error:', error.message);
            console.log('Falling back to text-only mode');
            return false;
        }
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