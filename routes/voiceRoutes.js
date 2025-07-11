const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

const voiceService = require('../services/voiceService');
const sessionService = require('../services/sessionService');
const authService = require('../services/authService');

const router = express.Router();

// Configure multer for audio file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const sessionId = req.params.sessionId || 'unknown';
        const timestamp = Date.now();
        cb(null, `${sessionId}_${timestamp}_${file.originalname}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Accept common audio formats
        const allowedTypes = /mp3|wav|m4a|ogg|webm/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

/**
 * Start a new voice session
 * POST /api/voice/start
 */
router.post('/start', async (req, res) => {
    try {
        const sessionId = sessionService.createSession();
        
        // Generate initial greeting
        const greeting = "Hi, I'm Casey from CVS Health. I'm here to help you with your prior authorization request. To get started, I'll need some basic information about the patient and the medication. Could you please provide the patient's full name?";
        
        // Convert greeting to speech
        const audioFile = await voiceService.textToSpeech(greeting, sessionId);
        
        // Add initial greeting to conversation history
        sessionService.addConversationTurn(sessionId, 'assistant', greeting);
        
        res.json({
            sessionId,
            message: greeting,
            audioFile: audioFile.startsWith('text-only:') ? null : path.basename(audioFile),
            textOnly: audioFile.startsWith('text-only:'),
            status: 'active',
            step: 'greeting'
        });
    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ error: 'Failed to start session' });
    }
});

/**
 * Process voice input and get response
 * POST /api/voice/process/:sessionId
 */
router.post('/process/:sessionId', upload.single('audio'), async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = sessionService.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        // Convert speech to text
        const transcribedText = await voiceService.speechToText(req.file.path);
        
        // Add user turn to conversation history
        sessionService.addConversationTurn(sessionId, 'user', transcribedText);
        
        // Process the input based on current step
        let response;
        let nextStep;
        
        if (session.step === 'greeting') {
            response = await processGreetingStep(sessionId, transcribedText);
        } else if (session.step === 'question_flow') {
            response = await processQuestionStep(sessionId, transcribedText);
        } else {
            response = "I'm sorry, but I'm not sure how to proceed. Let me transfer you to a human representative.";
        }

        // Add assistant turn to conversation history
        sessionService.addConversationTurn(sessionId, 'assistant', response.message);
        
        // Convert response to speech
        const audioFile = await voiceService.textToSpeech(response.message, sessionId);
        
        // Clean up uploaded file
        await fs.remove(req.file.path);

        // Get updated session data for the response
        const updatedSession = sessionService.getSession(sessionId);
        
        res.json({
            sessionId,
            transcribedText,
            message: response.message,
            audioFile: audioFile.startsWith('text-only:') ? null : path.basename(audioFile),
            textOnly: audioFile.startsWith('text-only:'),
            step: response.step,
            decision: response.decision,
            nextQuestion: response.nextQuestion,
            needsClarification: response.needsClarification || false,
            // Enhanced data for web interface
            extractedData: {
                memberName: updatedSession.memberName || null,
                dateOfBirth: updatedSession.dateOfBirth || null,
                drugName: updatedSession.drugName || null,
                confidence: response.confidence || 0.8
            },
            questionsAnswered: updatedSession.questionsAnswered || 0,
            totalQuestions: updatedSession.totalQuestions || 0
        });

    } catch (error) {
        console.error('Error processing voice input:', error);
        
        // Clean up uploaded file if it exists
        if (req.file) {
            await fs.remove(req.file.path).catch(() => {});
        }
        
        res.status(500).json({ error: 'Failed to process voice input' });
    }
});

/**
 * Get session status
 * GET /api/voice/session/:sessionId
 */
router.get('/session/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = sessionService.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const summary = sessionService.getSessionSummary(sessionId);
        res.json(summary);
    } catch (error) {
        console.error('Error getting session:', error);
        res.status(500).json({ error: 'Failed to get session' });
    }
});

/**
 * Get available drugs
 * GET /api/voice/drugs
 */
router.get('/drugs', (req, res) => {
    try {
        const drugs = sessionService.drugsData?.drugs || [];
        res.json({ drugs });
    } catch (error) {
        console.error('Error getting drugs:', error);
        res.status(500).json({ error: 'Failed to get drugs' });
    }
});

/**
 * Get random dummy patient for testing
 * GET /api/voice/random-patient
 */
router.get('/random-patient', (req, res) => {
    try {
        const patients = getDummyPatients();
        const randomPatient = patients[Math.floor(Math.random() * patients.length)];
        res.json(randomPatient);
    } catch (error) {
        console.error('Error getting random patient:', error);
        res.status(500).json({ error: 'Failed to get random patient' });
    }
});

/**
 * Get dummy patients data
 */
function getDummyPatients() {
    return [
        {
            Name: "John Smith",
            DOB: "03/15/1985",
            Medication: "Humira",
            Diagnosis: "Moderate-to-severe rheumatoid arthritis",
            BMI: "27.2",
            A1C: "5.6%",
            PriorTherapies: "Methotrexate (failed), Sulfasalazine (failed)",
            Labs: "RF positive, ESR 38 mm/hr",
            ClinicalNotes: "No history of TB, up to date on vaccinations",
            ExpectedOutcome: "APPROVE",
            Reason: "Meets all criteria for Humira (failed 2 DMARDs, labs support diagnosis)"
        },
        {
            Name: "Jane Doe",
            DOB: "01/10/1990",
            Medication: "Enbrel",
            Diagnosis: "Severe plaque psoriasis",
            BMI: "24.8",
            A1C: "5.4%",
            PriorTherapies: "Topical steroids (failed), Phototherapy (failed)",
            Labs: "Negative for hepatitis B/C, normal CBC",
            ClinicalNotes: "No contraindications, BSA >10%",
            ExpectedOutcome: "APPROVE",
            Reason: "Meets all criteria for Enbrel (failed topical and phototherapy)"
        },
        {
            Name: "Robert Johnson",
            DOB: "07/22/1972",
            Medication: "Xeljanz",
            Diagnosis: "Moderate ulcerative colitis",
            BMI: "29.1",
            A1C: "6.1%",
            PriorTherapies: "Mesalamine (failed), Azathioprine (failed)",
            Labs: "LFTs normal, CRP 12 mg/L",
            ClinicalNotes: "No documentation of prior anti-TNF therapy",
            ExpectedOutcome: "DENY",
            Reason: "Missing prior anti-TNF therapy documentation"
        },
        {
            Name: "Emily Davis",
            DOB: "12/05/2001",
            Medication: "Remicade",
            Diagnosis: "Crohn's disease, moderate",
            BMI: "22.5",
            A1C: "5.2%",
            PriorTherapies: "Budesonide (failed), Azathioprine (failed)",
            Labs: "CRP 18 mg/L, Fecal calprotectin elevated",
            ClinicalNotes: "Negative TB screen, up to date on vaccines",
            ExpectedOutcome: "APPROVE",
            Reason: "Meets all criteria for Remicade (failed steroids and immunomodulators)"
        },
        {
            Name: "Michael Brown",
            DOB: "09/30/1965",
            Medication: "Cosentyx",
            Diagnosis: "Ankylosing spondylitis",
            BMI: "31.0",
            A1C: "7.0%",
            PriorTherapies: "NSAIDs (failed), No prior anti-TNF trial",
            Labs: "HLA-B27 positive",
            ClinicalNotes: "No prior anti-TNF therapy attempted",
            ExpectedOutcome: "DENY",
            Reason: "Not indicated for diagnosis without prior anti-TNF trial"
        },
        {
            Name: "Sarah Wilson",
            DOB: "05/18/1988",
            Medication: "Stelara",
            Diagnosis: "Moderate-to-severe Crohn's disease",
            BMI: "26.3",
            A1C: "5.8%",
            PriorTherapies: "Infliximab (failed), Adalimumab (failed)",
            Labs: "CRP 15 mg/L",
            ClinicalNotes: "No contraindications, negative TB screen",
            ExpectedOutcome: "APPROVE",
            Reason: "Meets all criteria for Stelara (failed 2 biologics)"
        },
        {
            Name: "David Lee",
            DOB: "11/02/1975",
            Medication: "Otezla",
            Diagnosis: "Psoriatic arthritis",
            BMI: "28.7",
            A1C: "6.3%",
            PriorTherapies: "NSAIDs (failed), Methotrexate (incomplete documentation)",
            Labs: "CBC normal",
            ClinicalNotes: "No documentation of adequate methotrexate trial",
            ExpectedOutcome: "DENY",
            Reason: "Incomplete clinical information (methotrexate trial not documented)"
        },
        {
            Name: "Anna Martinez",
            DOB: "04/27/1995",
            Medication: "Simponi",
            Diagnosis: "Ulcerative colitis, severe",
            BMI: "23.9",
            A1C: "5.5%",
            PriorTherapies: "Mesalamine (failed), Prednisone (failed)",
            Labs: "CRP 20 mg/L",
            ClinicalNotes: "Negative TB, up to date on vaccines",
            ExpectedOutcome: "APPROVE",
            Reason: "Meets all criteria for Simponi (failed steroids and 5-ASA)"
        },
        {
            Name: "Chris Kim",
            DOB: "08/14/1982",
            Medication: "Taltz",
            Diagnosis: "Plaque psoriasis",
            BMI: "25.6",
            A1C: "5.7%",
            PriorTherapies: "Topical steroids (failed), Phototherapy (failed), No step therapy with biologic",
            Labs: "Hepatitis panel negative",
            ClinicalNotes: "No prior biologic attempted",
            ExpectedOutcome: "DENY",
            Reason: "Step therapy with biologic not completed"
        },
        {
            Name: "Lisa Patel",
            DOB: "02/23/1979",
            Medication: "Orencia",
            Diagnosis: "Rheumatoid arthritis, moderate",
            BMI: "27.8",
            A1C: "5.9%",
            PriorTherapies: "Methotrexate (failed), Leflunomide (failed), Adalimumab (failed)",
            Labs: "RF positive, ESR 42 mm/hr",
            ClinicalNotes: "No contraindications",
            ExpectedOutcome: "APPROVE",
            Reason: "Meets all criteria for Orencia (failed 2 DMARDs and 1 biologic)"
        }
    ];
}

/**
 * End session
 * POST /api/voice/end/:sessionId
 */
router.post('/end/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = sessionService.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // End the session
        sessionService.endSession(sessionId);
        
        // Clean up audio files
        await voiceService.cleanupSessionFiles(sessionId);
        
        res.json({ message: 'Session ended successfully' });
    } catch (error) {
        console.error('Error ending session:', error);
        res.status(500).json({ error: 'Failed to end session' });
    }
});

/**
 * Get authorization report
 * GET /api/voice/report/:sessionId
 */
router.get('/report/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const report = authService.generateReport(sessionId);
        res.json(report);
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

/**
 * Process greeting step - collect basic information
 */
async function processGreetingStep(sessionId, userInput) {
    const session = sessionService.getSession(sessionId);
    
    // Enhanced processing for shorter responses
    const processedInput = processShortGreetingInput(userInput);
    
    if (processedInput.needsClarification) {
        return {
            message: processedInput.clarificationMessage,
            step: 'greeting',
            needsClarification: true
        };
    }
    
    // Use enhanced extraction with LLM and fallback patterns
    let extractedInfo = await extractInformationWithLLM(processedInput.processedInput, session);
    let confidence = 0.8; // Default confidence
    
    // If LLM extraction didn't work well, try fallback pattern matching
    if (!extractedInfo.memberName && !extractedInfo.dateOfBirth && !extractedInfo.drugName) {
        extractedInfo = extractInformationWithPatterns(processedInput.processedInput, session);
        confidence = 0.6; // Lower confidence for pattern matching
    }
    
    // Update session with extracted information
    if (Object.keys(extractedInfo).length > 0) {
        sessionService.updateSession(sessionId, extractedInfo);
    }
    
    // Determine next question based on what's missing
    if (!session.memberName && !extractedInfo.memberName) {
        return {
            message: "I didn't catch the patient's name. Could you please provide the patient's full name?",
            step: 'greeting',
            confidence: confidence,
            isConfirmation: false
        };
    }
    
    if (!session.dateOfBirth && !extractedInfo.dateOfBirth) {
        return {
            message: "Thanks. Now I need the patient's date of birth. What is the patient's date of birth?",
            step: 'greeting',
            confidence: confidence,
            isConfirmation: false
        };
    }
    
    if (!session.drugName && !extractedInfo.drugName) {
        return {
            message: "Thanks. What medication are you requesting authorization for?",
            step: 'greeting',
            confidence: confidence,
            isConfirmation: false
        };
    }
    
    // All basic info collected, find the drug and start question flow
    const updatedSession = sessionService.getSession(sessionId);
    const drug = sessionService.findDrug(updatedSession.drugName);
    
    if (!drug) {
        return {
            message: "I'm sorry, but I don't recognize that medication. Could you please provide the exact name of the medication you're requesting?",
            step: 'greeting',
            isConfirmation: false
        };
    }
    
    // Initialize question flow
    sessionService.initializeQuestionFlow(sessionId, drug.id);
    sessionService.updateSession(sessionId, { drugName: drug.name });
    
    const currentQuestion = sessionService.getCurrentQuestion(sessionId);
    
    return {
        message: `Thanks. I found ${drug.name} in our system. Now I need to ask you some clinical questions to process this authorization. ${currentQuestion.text}`,
        step: 'question_flow',
        nextQuestion: currentQuestion,
        confidence: confidence,
        isConfirmation: false
    };
}

/**
 * Process question step - handle authorization questions
 */
async function processQuestionStep(sessionId, userInput) {
    const result = await sessionService.processAnswer(sessionId, userInput);
    
    if (result.action === 'complete') {
        // Process the final decision
        const decision = authService.processDecision(sessionId, result.decision, result.reason);
        
        return {
            message: decision.message,
            step: 'complete',
            decision: result.decision,
            reason: result.reason,
            action: 'complete',
            isConfirmation: false
        };
    } else if (result.action === 'clarification') {
        // Handle clarification requests for short/unclear responses
        return {
            message: result.message,
            step: 'question_flow',
            needsClarification: true,
            question: result.question,
            isConfirmation: false
        };
    } else if (result.action === 'next_question') {
        if (result.question) {
            return {
                message: result.question.text,
                step: 'question_flow',
                nextQuestion: result.question,
                isConfirmation: false
            };
        } else {
            return {
                message: "I've completed all the necessary questions. Let me process your authorization request.",
                step: 'processing',
                action: 'checking',
                isConfirmation: false
            };
        }
    } else {
        return {
            message: "I'm sorry, I didn't understand your response. Could you please repeat that?",
            step: 'question_flow',
            isConfirmation: false
        };
    }
}

/**
 * Launch voice agent in terminal
 * POST /api/voice/launch-agent
 */
router.post('/launch-agent', async (req, res) => {
    try {
        const { spawn } = require('child_process');
        const path = require('path');
        
        // Launch the voice agent in a new terminal window
        let command, args;
        
        if (process.platform === 'darwin') {
            // macOS - use Terminal.app
            command = 'osascript';
            args = [
                '-e', 
                `tell application "Terminal" to do script "cd ${process.cwd()} && npm run voice"`
            ];
        } else if (process.platform === 'win32') {
            // Windows - use cmd
            command = 'cmd';
            args = ['/c', 'start', 'cmd', '/k', 'npm run voice'];
        } else {
            // Linux - use gnome-terminal or xterm
            command = 'gnome-terminal';
            args = ['--', 'bash', '-c', 'npm run voice'];
        }
        
        const child = spawn(command, args, {
            detached: true,
            stdio: 'ignore'
        });
        
        child.unref();
        
        res.json({ 
            success: true, 
            message: 'Voice agent launched in new terminal window',
            platform: process.platform
        });
        
    } catch (error) {
        console.error('Error launching voice agent:', error);
        res.status(500).json({ 
            error: 'Failed to launch voice agent',
            message: 'Please run "npm run voice" manually in your terminal'
        });
    }
});

/**
 * Enhanced information extraction using LLM
 */
async function extractInformationWithLLM(userInput, session) {
    try {
        const OpenAI = require('openai');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        const systemPrompt = `You are an AI assistant that extracts specific information from user input for a prior authorization system. 

Extract ONLY the following information if present in the user's input:
- memberName: The patient's full name (first and last name)
- dateOfBirth: The patient's date of birth in MM/DD/YYYY format
- drugName: The name of the medication being requested

Rules:
1. Only extract information that is explicitly mentioned or clearly implied
2. For dates, convert to MM/DD/YYYY format if possible
3. For drug names, use the most specific/complete name mentioned
4. If information is not present, set the field to null
5. Be flexible with how people express information (e.g., "born on", "DOB", "patient is", etc.)
6. For short responses, be more lenient and try to extract partial information
7. If a single word is provided and it looks like a name, extract it as memberName
8. If a single word is provided and it looks like a drug name, extract it as drugName
9. Handle incomplete information gracefully - extract what you can

Return ONLY a valid JSON object with these exact field names:
{
  "memberName": "string or null",
  "dateOfBirth": "string or null", 
  "drugName": "string or null"
}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userInput }
            ],
            temperature: 0.1,
            max_tokens: 200
        });

        const content = response.choices[0].message.content;
        const extracted = JSON.parse(content);
        
        return {
            memberName: extracted.memberName || null,
            dateOfBirth: extracted.dateOfBirth || null,
            drugName: extracted.drugName || null
        };
    } catch (error) {
        console.error('LLM extraction error:', error);
        return { memberName: null, dateOfBirth: null, drugName: null };
    }
}

/**
 * Process short greeting input with enhanced validation
 * @param {string} userInput - Raw user input
 * @returns {Object} - Processed input with clarification needs
 */
function processShortGreetingInput(userInput) {
    const normalizedInput = userInput.toLowerCase().trim();
    
    // Handle empty or very short responses
    if (!normalizedInput || normalizedInput.length < 3) {
        return {
            processedInput: userInput,
            needsClarification: true,
            clarificationMessage: "I didn't quite catch that. Could you please provide the patient's name, date of birth, and the medication you're requesting?"
        };
    }
    
    // Check if input contains enough information
    const hasName = /(?:name|called|patient|member)/i.test(normalizedInput);
    const hasDate = /(?:born|birth|dob|date)/i.test(normalizedInput);
    const hasDrug = /(?:drug|medication|prescribing|requesting|need|want)/i.test(normalizedInput);
    
    // If input is too short and doesn't contain key information, ask for clarification
    if (normalizedInput.length < 10 && !hasName && !hasDate && !hasDrug) {
        return {
            processedInput: userInput,
            needsClarification: true,
            clarificationMessage: "I need more information to help you. Could you please provide the patient's name, date of birth, and the medication you're requesting?"
        };
    }
    
    // Handle single word responses that might be names
    if (normalizedInput.split(' ').length === 1 && normalizedInput.length > 2) {
        // This might be just a name, ask for more information
        return {
            processedInput: userInput,
            needsClarification: true,
            clarificationMessage: `Thank you for providing "${userInput}". I also need the patient's date of birth and the medication you're requesting.`
        };
    }
    
    return {
        processedInput: userInput,
        needsClarification: false
    };
}

/**
 * Fallback pattern-based information extraction
 */
function extractInformationWithPatterns(userInput, session) {
    const extracted = {};
    
    // Enhanced name extraction patterns for shorter responses
    const namePatterns = [
        /(?:name is|called|patient is|patient's name is)\s+([A-Za-z\s]+)/i,
        /(?:my name is|I'm|I am)\s+([A-Za-z\s]+)/i,
        /^([A-Za-z]+\s+[A-Za-z]+)$/, // Just two words that look like a name
        /^([A-Za-z]+)$/ // Single word that might be a name (for very short responses)
    ];
    
    for (const pattern of namePatterns) {
        const match = userInput.match(pattern);
        if (match && !session.memberName) {
            const potentialName = match[1].trim();
            // Additional validation for single word names
            if (pattern.source.includes('^([A-Za-z]+)$')) {
                // For single words, check if it looks like a name (not a drug, date, etc.)
                if (potentialName.length > 2 && !isLikelyDrug(potentialName) && !isLikelyDate(potentialName)) {
                    extracted.memberName = potentialName;
                }
            } else {
                extracted.memberName = potentialName;
            }
            break;
        }
    }
    
    // Date of birth extraction patterns
    const datePatterns = [
        /(?:born|birthday|DOB|date of birth)\s+([0-9\/\-]+)/i,
        /(?:born|birthday|DOB|date of birth)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+([0-9]{1,2}),?\s+([0-9]{4})/i,
        /([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})/,
        /([0-9]{1,2})-([0-9]{1,2})-([0-9]{4})/
    ];
    
    for (const pattern of datePatterns) {
        const match = userInput.match(pattern);
        if (match && !session.dateOfBirth) {
            if (pattern.source.includes('january|february')) {
                // Handle month names
                const month = match[1].toLowerCase();
                const day = match[2].padStart(2, '0');
                const year = match[3];
                const monthMap = {
                    'january': '01', 'february': '02', 'march': '03', 'april': '04',
                    'may': '05', 'june': '06', 'july': '07', 'august': '08',
                    'september': '09', 'october': '10', 'november': '11', 'december': '12'
                };
                extracted.dateOfBirth = `${monthMap[month]}/${day}/${year}`;
            } else {
                // Handle numeric dates
                const parts = match[0].split(/[\/\-]/);
                if (parts.length === 3) {
                    const month = parts[0].padStart(2, '0');
                    const day = parts[1].padStart(2, '0');
                    const year = parts[2];
                    extracted.dateOfBirth = `${month}/${day}/${year}`;
                }
            }
            break;
        }
    }
    
    // Enhanced drug name extraction patterns for shorter responses
    const drugPatterns = [
        /(?:drug|medication|prescribing|requesting|need|want)\s+([A-Za-z\s]+)/i,
        /(?:for|to treat)\s+([A-Za-z\s]+)/i,
        /^([A-Za-z]+)$/ // Single word that might be a drug (for very short responses)
    ];
    
    for (const pattern of drugPatterns) {
        const match = userInput.match(pattern);
        if (match && !session.drugName) {
            const potentialDrug = match[1].trim();
            // Additional validation for single word drugs
            if (pattern.source.includes('^([A-Za-z]+)$')) {
                // For single words, check if it looks like a drug name
                if (potentialDrug.length > 2 && isLikelyDrug(potentialDrug)) {
                    extracted.drugName = potentialDrug;
                }
            } else {
                extracted.drugName = potentialDrug;
            }
            break;
        }
    }
    
    return extracted;
}

/**
 * Check if a word is likely to be a drug name
 * @param {string} word - Word to check
 * @returns {boolean} - True if likely a drug
 */
function isLikelyDrug(word) {
    const commonDrugs = [
        'humira', 'ozempic', 'wegovy', 'mounjaro', 'stelara', 'skyrizi', 'dupixent',
        'rinvoq', 'xeljanz', 'cosentyx', 'taltz', 'tremfya', 'entyvio', 'simponi',
        'orencia', 'otezla', 'remicade', 'enbrel', 'adalimumab', 'infliximab'
    ];
    return commonDrugs.includes(word.toLowerCase());
}

/**
 * Check if a word is likely to be a date
 * @param {string} word - Word to check
 * @returns {boolean} - True if likely a date
 */
function isLikelyDate(word) {
    // Check for date patterns
    const datePatterns = [
        /^\d{1,2}\/\d{1,2}\/\d{4}$/, // MM/DD/YYYY
        /^\d{1,2}-\d{1,2}-\d{4}$/,   // MM-DD-YYYY
        /^\d{8}$/,                    // MMDDYYYY
        /^(january|february|march|april|may|june|july|august|september|october|november|december)$/i
    ];
    
    return datePatterns.some(pattern => pattern.test(word));
}

module.exports = router; 