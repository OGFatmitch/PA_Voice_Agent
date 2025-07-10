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
        const greeting = "Hello, thank you for calling our prior authorization line. I'm here to help you with your medication authorization request. To get started, I'll need some basic information about the patient and the medication. Could you please provide the patient's full name?";
        
        // Convert greeting to speech
        const audioFile = await voiceService.textToSpeech(greeting, sessionId);
        
        res.json({
            sessionId,
            message: greeting,
            audioFile: path.basename(audioFile),
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

        // Convert response to speech
        const audioFile = await voiceService.textToSpeech(response.message, sessionId);
        
        // Clean up uploaded file
        await fs.remove(req.file.path);

        res.json({
            sessionId,
            transcribedText,
            message: response.message,
            audioFile: path.basename(audioFile),
            step: response.step,
            decision: response.decision,
            nextQuestion: response.nextQuestion
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
    const lowerInput = userInput.toLowerCase();
    
    // Extract information using NLP-like approach
    let extractedInfo = {};
    
    // Try to extract member name
    if (!session.memberName) {
        // Simple name extraction - in production, use more sophisticated NLP
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
        sessionService.updateSession(sessionId, extractedInfo);
    }
    
    // Determine next question based on what's missing
    if (!session.memberName && !extractedInfo.memberName) {
        return {
            message: "I didn't catch the patient's name. Could you please provide the patient's full name?",
            step: 'greeting'
        };
    }
    
    if (!session.dateOfBirth && !extractedInfo.dateOfBirth) {
        return {
            message: "Thank you. Now I need the patient's date of birth. What is the patient's date of birth?",
            step: 'greeting'
        };
    }
    
    if (!session.drugName && !extractedInfo.drugName) {
        return {
            message: "Thank you. What medication are you requesting authorization for?",
            step: 'greeting'
        };
    }
    
    // All basic info collected, find the drug and start question flow
    const updatedSession = sessionService.getSession(sessionId);
    const drug = sessionService.findDrug(updatedSession.drugName);
    
    if (!drug) {
        return {
            message: "I'm sorry, but I don't recognize that medication. Could you please provide the exact name of the medication you're requesting?",
            step: 'greeting'
        };
    }
    
    // Initialize question flow
    sessionService.initializeQuestionFlow(sessionId, drug.id);
    sessionService.updateSession(sessionId, { drugName: drug.name });
    
    const currentQuestion = sessionService.getCurrentQuestion(sessionId);
    
    return {
        message: `Thank you. I found ${drug.name} in our system. Now I need to ask you some clinical questions to process this authorization. ${currentQuestion.text}`,
        step: 'question_flow',
        nextQuestion: currentQuestion
    };
}

/**
 * Process question step - handle authorization questions
 */
async function processQuestionStep(sessionId, userInput) {
    const result = sessionService.processAnswer(sessionId, userInput);
    
    if (result.action === 'complete') {
        // Process the final decision
        const decision = authService.processDecision(sessionId, result.decision, result.reason);
        
        return {
            message: decision.message,
            step: 'complete',
            decision: result.decision,
            reason: result.reason
        };
    } else if (result.action === 'next_question') {
        if (result.question) {
            return {
                message: result.question.text,
                step: 'question_flow',
                nextQuestion: result.question
            };
        } else {
            return {
                message: "I've completed all the necessary questions. Let me process your authorization request.",
                step: 'processing'
            };
        }
    } else {
        return {
            message: "I'm sorry, I didn't understand your response. Could you please repeat that?",
            step: 'question_flow'
        };
    }
}

module.exports = router; 