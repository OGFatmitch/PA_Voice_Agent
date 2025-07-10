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
        
        this.voiceModel = process.env.VOICE_MODEL || 'alloy';
        this.voiceSpeed = parseFloat(process.env.VOICE_SPEED) || 1.0;
        this.tempDir = process.env.TEMP_DIR || './temp';
        
        // Ensure temp directory exists
        fs.ensureDirSync(this.tempDir);
        
        // Initialize services
        this.sessionService = sessionService;
        this.authService = authService;
        
        this.conversationHistory = [];
        this.sessionId = null;
        
        console.log('🎤 Voice Agent initialized');
        console.log(`Voice Model: ${this.voiceModel}`);
        console.log(`Voice Speed: ${this.voiceSpeed}`);
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
                    const [key, ...valueParts] = trimmedLine.split('=');
                    if (key && valueParts.length > 0) {
                        const value = valueParts.join('=').trim();
                        process.env[key.trim()] = value;
                    }
                }
            });
        }
    }

    async start() {
        // Wait for session service to load data
        console.log('🔄 Loading question sets and drug data...');
        while (!this.sessionService.dataLoaded) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log('✅ Data loaded successfully');
        
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
            console.log('🎤 Listening... (speak now)');
            
            // Record audio using system command
            const audioFile = await this.recordAudio();
            
            if (audioFile) {
                console.log('🔄 Processing your speech...');
                
                // Convert speech to text
                const text = await this.speechToText(audioFile);
                
                if (text && text.trim()) {
                    console.log(`👤 You said: "${text}"`);
                    
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
                    const response = await this.processInput(text);
                    console.log(`🤖 Assistant: "${response}"`);
                    
                    // Speak the response
                    await this.speak(response);
                    
                    // Continue listening
                    setTimeout(() => this.listenForVoice(), 1000);
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
            setTimeout(() => this.listenForVoice(), 1000);
        }
    }

    async recordAudio() {
        return new Promise((resolve, reject) => {
            const audioFile = path.join(this.tempDir, `${this.sessionId}_input_${Date.now()}.wav`);
            
            // Use sox to record audio (cross-platform)
            const sox = spawn('sox', [
                '-d', // Use default input device
                audioFile,
                'trim', '0', '10', // Record for 10 seconds max
                'silence', '1', '0.1', '1%', '1', '1.0', '1%' // Stop on silence
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
                    resolve(audioFile);
                } else {
                    reject(new Error('Failed to record audio'));
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



    async processInput(userInput) {
        const session = this.sessionService.getSession(this.sessionId);
        if (!session) {
            return "I'm sorry, but I'm having trouble with your session. Let me start over.";
        }

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

    async processGreetingStep(userInput) {
        const session = this.sessionService.getSession(this.sessionId);
        const lowerInput = userInput.toLowerCase();
        
        // Extract information using NLP-like approach
        let extractedInfo = {};
        
        // Try to extract member name
        if (!session.memberName) {
            const nameMatch = userInput.match(/(?:name is|called|patient is)\s+([A-Za-z\s]+)/i);
            if (nameMatch) {
                extractedInfo.memberName = nameMatch[1].trim();
            } else {
                // Assume the whole input is the name if it looks like a name
                const words = userInput.split(' ').filter(word => word.length > 1);
                if (words.length <= 4 && words.every(word => /^[A-Za-z]+$/.test(word))) {
                    extractedInfo.memberName = userInput.trim();
                }
            }
        }
        
        // Try to extract date of birth
        if (!session.dateOfBirth) {
            const dobMatch = userInput.match(/(?:born|birthday|DOB|date of birth)\s+([0-9\/\-]+)/i);
            if (dobMatch) {
                extractedInfo.dateOfBirth = dobMatch[1].trim();
            }
        }
        
        // Try to extract drug name
        if (!session.drugName) {
            const drugMatch = userInput.match(/(?:drug|medication|prescribing|requesting)\s+([A-Za-z\s]+)/i);
            if (drugMatch) {
                extractedInfo.drugName = drugMatch[1].trim();
            }
        }
        
        // Update session with extracted information
        if (Object.keys(extractedInfo).length > 0) {
            this.sessionService.updateSession(this.sessionId, extractedInfo);
        }
        
        // Determine next question based on what's missing
        if (!session.memberName && !extractedInfo.memberName) {
            return "I didn't catch the patient's name. Could you please provide the patient's full name?";
        }
        
        if (!session.dateOfBirth && !extractedInfo.dateOfBirth) {
            return "Thank you. Now I need the patient's date of birth. What is the patient's date of birth?";
        }
        
        if (!session.drugName && !extractedInfo.drugName) {
            return "Thank you. What medication are you requesting authorization for?";
        }
        
        // All basic info collected, find the drug and start question flow
        const updatedSession = this.sessionService.getSession(this.sessionId);
        const drug = this.sessionService.findDrug(updatedSession.drugName);
        
        if (!drug) {
            return "I'm sorry, but I don't recognize that medication. Could you please provide the exact name of the medication you're requesting?";
        }
        
        // Initialize question flow
        this.sessionService.initializeQuestionFlow(this.sessionId, drug.id);
        this.sessionService.updateSession(this.sessionId, { drugName: drug.name });
        
        const currentQuestion = this.sessionService.getCurrentQuestion(this.sessionId);
        
        return `Thank you. I found ${drug.name} in our system. Now I need to ask you some clinical questions to process this authorization. ${currentQuestion.text}`;
    }

    async processQuestionStep(userInput) {
        const result = this.sessionService.processAnswer(this.sessionId, userInput);
        
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