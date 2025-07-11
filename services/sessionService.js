const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');

class SessionService {
    constructor() {
        this.sessions = new Map();
        this.drugsData = null;
        this.questionsData = null;
        this.dataLoaded = false;
        this.loadData();
    }

    /**
     * Load drug and question data from JSON files
     */
    async loadData() {
        try {
            const drugsPath = path.join(__dirname, '../data/drugs.json');
            const questionsPath = path.join(__dirname, '../data/questions.json');
            
            this.drugsData = await fs.readJson(drugsPath);
            this.questionsData = await fs.readJson(questionsPath);
            this.dataLoaded = true;
        } catch (error) {
            console.error('Error loading data:', error);
            throw new Error('Failed to load drug and question data');
        }
    }

    /**
     * Create a new session
     * @returns {string} - Session ID
     */
    createSession() {
        const sessionId = uuidv4();
        const session = {
            id: sessionId,
            createdAt: new Date(),
            status: 'active',
            step: 'greeting',
            memberName: null,
            dateOfBirth: null,
            drugName: null,
            drugId: null,
            currentQuestionId: null,
            answers: {},
            questionFlow: [],
            currentQuestionIndex: 0,
            decision: null,
            decisionReason: null,
            conversationHistory: [] // Track conversation turns
        };

        this.sessions.set(sessionId, session);
        return sessionId;
    }

    /**
     * Get session by ID
     * @param {string} sessionId - Session identifier
     * @returns {Object|null} - Session object or null if not found
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Update session data
     * @param {string} sessionId - Session identifier
     * @param {Object} updates - Data to update
     */
    updateSession(sessionId, updates) {
        const session = this.sessions.get(sessionId);
        if (session) {
            Object.assign(session, updates);
            session.updatedAt = new Date();
        }
    }

    /**
     * Calculate similarity between two strings using Levenshtein distance
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} - Similarity score (0-1, where 1 is exact match)
     */
    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    /**
     * Calculate Levenshtein distance between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} - Distance
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Handle common transcription errors for drug names
     * @param {string} drugName - Drug name to correct
     * @returns {string} - Corrected drug name
     */
    correctTranscriptionErrors(drugName) {
        const corrections = {
            'manjaro': 'mounjaro',
            'ozempick': 'ozempic',
            'wegovy': 'wegovy', // already correct
            'humira': 'humira', // already correct
            'stelara': 'stelara', // already correct
            'skyrizi': 'skyrizi', // already correct
            'dupixent': 'dupixent', // already correct
            'rinvoq': 'rinvoq', // already correct
            'xeljanz': 'xeljanz', // already correct
            'cosentyx': 'cosentyx', // already correct
            'taltz': 'taltz', // already correct
            'tremfya': 'tremfya', // already correct
            'entyvio': 'entyvio' // already correct
        };
        
        const lowerDrugName = drugName.toLowerCase().trim();
        return corrections[lowerDrugName] || drugName;
    }

    /**
     * Find drug by name or common names with fuzzy matching
     * @param {string} drugName - Drug name to search for
     * @returns {Object|null} - Drug object or null if not found
     */
    findDrug(drugName) {
        if (!this.drugsData || !this.dataLoaded) return null;

        // First try to correct common transcription errors
        const correctedDrugName = this.correctTranscriptionErrors(drugName);
        if (correctedDrugName !== drugName) {
            console.log(`🔧 Corrected transcription: "${drugName}" -> "${correctedDrugName}"`);
        }
        
        const searchTerm = correctedDrugName.toLowerCase().trim();
        
        // First try exact matches
        let exactMatch = this.drugsData.drugs.find(drug => {
            return drug.name.toLowerCase() === searchTerm ||
                   drug.genericName.toLowerCase() === searchTerm ||
                   drug.commonNames.some(name => name.toLowerCase() === searchTerm);
        });
        
        if (exactMatch) {
            console.log(`✅ Exact match found: "${drugName}" -> "${exactMatch.name}"`);
            return exactMatch;
        }
        
        // If no exact match, try fuzzy matching with stricter criteria
        const fuzzyMatches = this.drugsData.drugs.map(drug => {
            const nameSimilarity = this.calculateSimilarity(searchTerm, drug.name.toLowerCase());
            const genericSimilarity = this.calculateSimilarity(searchTerm, drug.genericName.toLowerCase());
            const commonNameSimilarities = drug.commonNames.map(name => 
                this.calculateSimilarity(searchTerm, name.toLowerCase())
            );
            
            const maxSimilarity = Math.max(
                nameSimilarity, 
                genericSimilarity, 
                ...commonNameSimilarities
            );
            
            return { drug, similarity: maxSimilarity };
        }).filter(match => {
            // Stricter filtering: require higher similarity for shorter names
            const searchLength = searchTerm.length;
            const drugLength = match.drug.name.toLowerCase().length;
            const lengthDiff = Math.abs(searchLength - drugLength);
            
            // For names with significant length difference, require higher similarity
            if (lengthDiff > 2) {
                return match.similarity >= 0.85; // 85% similarity for length differences
            } else {
                return match.similarity >= 0.8; // 80% similarity for similar lengths
            }
        });
        
        if (fuzzyMatches.length > 0) {
            // Return the best match
            const bestMatch = fuzzyMatches.reduce((best, current) => 
                current.similarity > best.similarity ? current : best
            );
            
            console.log(`🔍 Fuzzy match found: "${drugName}" -> "${bestMatch.drug.name}" (${Math.round(bestMatch.similarity * 100)}% similarity)`);
            console.log(`   Search term length: ${searchTerm.length}, Drug name length: ${bestMatch.drug.name.length}`);
            return bestMatch.drug;
        }
        
        console.log(`❌ No match found for: "${drugName}"`);
        return null;
    }

    /**
     * Find drug with confidence scoring
     * @param {string} drugName - Drug name to search for
     * @returns {Object} - Object with drug and confidence score
     */
    findDrugWithConfidence(drugName) {
        if (!this.drugsData || !this.dataLoaded) {
            return { drug: null, confidence: 0, alternatives: [] };
        }

        // First try to correct common transcription errors
        const correctedDrugName = this.correctTranscriptionErrors(drugName);
        if (correctedDrugName !== drugName) {
            console.log(`🔧 Corrected transcription: "${drugName}" -> "${correctedDrugName}"`);
        }
        
        const searchTerm = correctedDrugName.toLowerCase().trim();
        
        // Get all matches with confidence scores
        const matches = this.drugsData.drugs.map(drug => {
            const nameSimilarity = this.calculateSimilarity(searchTerm, drug.name.toLowerCase());
            const genericSimilarity = this.calculateSimilarity(searchTerm, drug.genericName.toLowerCase());
            const commonNameSimilarities = drug.commonNames.map(name => 
                this.calculateSimilarity(searchTerm, name.toLowerCase())
            );
            
            const maxSimilarity = Math.max(
                nameSimilarity, 
                genericSimilarity, 
                ...commonNameSimilarities
            );
            
            return { drug, similarity: maxSimilarity };
        }).filter(match => {
            // Apply the same stricter filtering as findDrug
            const searchLength = searchTerm.length;
            const drugLength = match.drug.name.toLowerCase().length;
            const lengthDiff = Math.abs(searchLength - drugLength);
            
            if (lengthDiff > 2) {
                return match.similarity >= 0.75; // Slightly lower threshold for alternatives
            } else {
                return match.similarity >= 0.7; // 70% similarity for similar lengths
            }
        });
        
        // Sort by similarity
        matches.sort((a, b) => b.similarity - a.similarity);
        
        if (matches.length === 0) {
            return { drug: null, confidence: 0, alternatives: [] };
        }
        
        const bestMatch = matches[0];
        const alternatives = matches.slice(1, 4).map(match => ({
            name: match.drug.name,
            similarity: match.similarity
        }));
        
        console.log(`🔍 Drug search results for "${drugName}":`);
        console.log(`   Best match: ${bestMatch.drug.name} (${Math.round(bestMatch.similarity * 100)}%)`);
        if (alternatives.length > 0) {
            console.log(`   Alternatives: ${alternatives.map(alt => `${alt.name} (${Math.round(alt.similarity * 100)}%)`).join(', ')}`);
        }
        
        return {
            drug: bestMatch.drug,
            confidence: bestMatch.similarity,
            alternatives
        };
    }

    /**
     * Get question set for a drug
     * @param {string} questionSetId - Question set identifier
     * @returns {Object|null} - Question set or null if not found
     */
    getQuestionSet(questionSetId) {
        if (!this.questionsData) return null;
        return this.questionsData.questionSets[questionSetId] || null;
    }

    /**
     * Initialize question flow for a session
     * @param {string} sessionId - Session identifier
     * @param {string} drugId - Drug identifier
     */
    initializeQuestionFlow(sessionId, drugId) {
        const session = this.getSession(sessionId);
        const drug = this.drugsData.drugs.find(d => d.id === drugId);
        
        if (!session || !drug) return;

        const questionSet = this.getQuestionSet(drug.questionSet);
        if (!questionSet) return;

        session.drugId = drugId;
        session.questionFlow = questionSet.questions;
        session.currentQuestionIndex = 0;
        session.step = 'question_flow';
        
        this.updateSession(sessionId, session);
    }

    /**
     * Get current question for a session
     * @param {string} sessionId - Session identifier
     * @returns {Object|null} - Current question or null if no more questions
     */
    getCurrentQuestion(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || session.currentQuestionIndex >= session.questionFlow.length) {
            return null;
        }

        return session.questionFlow[session.currentQuestionIndex];
    }

    /**
     * Process answer with enhanced support for shorter responses
     * @param {string} sessionId - Session identifier
     * @param {string} answer - User's answer
     * @returns {Object} - Next step information
     */
    async processAnswer(sessionId, answer) {
        const session = this.getSession(sessionId);
        if (!session) return { action: 'error', message: 'Session not found' };

        const currentQuestion = this.getCurrentQuestion(sessionId);
        if (!currentQuestion) return { action: 'complete', decision: session.decision };

        // Enhanced answer processing for shorter responses
        const processedAnswer = await this.processShortAnswer(answer, currentQuestion);
        
        if (processedAnswer.needsClarification) {
            return {
                action: 'clarification',
                message: processedAnswer.clarificationMessage,
                question: currentQuestion
            };
        }

        // Store the processed answer
        session.answers[currentQuestion.id] = processedAnswer.answer;

        // Determine next step based on question type and processed answer
        const nextStep = this.determineNextStep(currentQuestion, processedAnswer.answer);
        
        if (nextStep === 'approve' || nextStep === 'deny' || nextStep === 'documentation_required') {
            session.decision = nextStep;
            session.step = 'complete';
            session.decisionReason = this.getDecisionReason(currentQuestion, processedAnswer.answer);
            return { action: 'complete', decision: nextStep, reason: session.decisionReason };
        }

        // Move to next question
        session.currentQuestionIndex++;
        this.updateSession(sessionId, session);

        return { action: 'next_question', question: this.getCurrentQuestion(sessionId) };
    }

    /**
     * Process short answers with enhanced validation and clarification
     * @param {string} answer - Raw user answer
     * @param {Object} question - Current question being asked
     * @returns {Object} - Processed answer with clarification needs
     */
    async processShortAnswer(answer, question) {
        const normalizedAnswer = answer.toLowerCase().trim();
        
        // Handle empty or very short responses
        if (!normalizedAnswer || normalizedAnswer.length < 2) {
            return {
                answer: null,
                needsClarification: true,
                clarificationMessage: this.getClarificationMessage(question, 'too_short')
            };
        }

        // Handle question type specific processing
        switch (question.type) {
            case 'yes_no':
                return this.processYesNoAnswer(normalizedAnswer, question);
            case 'multiple_choice':
                return this.processMultipleChoiceAnswer(normalizedAnswer, question);
            case 'numeric':
                return this.processNumericAnswer(normalizedAnswer, question);
            case 'text':
                return this.processTextAnswer(normalizedAnswer, question);
            default:
                return {
                    answer: answer,
                    needsClarification: false
                };
        }
    }

    /**
     * Process yes/no answers with enhanced validation
     * @param {string} answer - Normalized answer
     * @param {Object} question - Current question
     * @returns {Object} - Processed answer
     */
    processYesNoAnswer(answer, question) {
        const yesPatterns = ['yes', 'y', 'yeah', 'yep', 'sure', 'okay', 'ok', 'correct', 'right', 'true'];
        const noPatterns = ['no', 'n', 'nope', 'nah', 'negative', 'false', 'incorrect', 'wrong'];
        
        if (yesPatterns.includes(answer)) {
            return { answer: 'yes', needsClarification: false };
        } else if (noPatterns.includes(answer)) {
            return { answer: 'no', needsClarification: false };
        } else {
            // Check for partial matches
            const isPartialYes = yesPatterns.some(pattern => answer.includes(pattern));
            const isPartialNo = noPatterns.some(pattern => answer.includes(pattern));
            
            if (isPartialYes && !isPartialNo) {
                return { answer: 'yes', needsClarification: false };
            } else if (isPartialNo && !isPartialYes) {
                return { answer: 'no', needsClarification: false };
            } else {
                return {
                    answer: null,
                    needsClarification: true,
                    clarificationMessage: this.getClarificationMessage(question, 'unclear_yes_no')
                };
            }
        }
    }

    /**
     * Process multiple choice answers using LLM for intelligent matching
     * @param {string} answer - Normalized answer
     * @param {Object} question - Current question
     * @returns {Object} - Processed answer
     */
    async processMultipleChoiceAnswer(answer, question) {
        if (!question.options) {
            return { answer: answer, needsClarification: false };
        }

        // Try exact match first (for efficiency)
        const exactMatch = question.options.find(option => 
            option.toLowerCase() === answer
        );
        
        if (exactMatch) {
            return { answer: exactMatch, needsClarification: false };
        }

        // Use LLM to determine the best match
        const llmMatch = await this.findLLMMatch(answer, question);
        
        if (llmMatch.matched) {
            return { answer: llmMatch.option, needsClarification: false };
        } else if (llmMatch.possibleMatches && llmMatch.possibleMatches.length > 1) {
            return {
                answer: null,
                needsClarification: true,
                clarificationMessage: this.getClarificationMessage(question, 'multiple_matches', llmMatch.possibleMatches)
            };
        }

        // Fallback to traditional matching if LLM fails
        return this.fallbackMultipleChoiceMatching(answer, question);
    }

    /**
     * Use LLM to find the best match for a user's answer
     * @param {string} answer - User's answer
     * @param {Object} question - Current question
     * @returns {Object} - Match result
     */
    async findLLMMatch(answer, question) {
        try {
            const OpenAI = require('openai');
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            const systemPrompt = `You are an AI assistant that determines if a user's response matches any of the provided options for a medical question.

TASK:
- Analyze the user's response and determine which option it best matches
- Consider medical terminology, common variations, abbreviations, and natural language
- Handle modifiers like "severe", "moderate", "mild", "chronic", etc.
- Be flexible with word order and phrasing
- Consider medical abbreviations (e.g., "RA" = "Rheumatoid Arthritis")

RULES:
1. Only return a match if you are confident the user is referring to that specific option
2. If multiple options could match, list all possibilities
3. If no clear match exists, return null
4. Be lenient with medical terminology variations
5. Consider context and common medical language

Return ONLY a valid JSON object with this exact format:
{
  "matched": true/false,
  "option": "exact_option_text" or null,
  "confidence": 0.0-1.0,
  "possibleMatches": ["option1", "option2"] or [],
  "reasoning": "brief explanation"
}`;

            const userPrompt = `Question: "${question.text}"

Available options:
${question.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

User's response: "${answer}"

Which option does the user's response match?`;

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.1,
                max_tokens: 300
            });

            const content = response.choices[0].message.content;
            const result = JSON.parse(content);
            
            console.log(`🤖 LLM Match Analysis:`);
            console.log(`   User: "${answer}"`);
            console.log(`   Matched: ${result.matched}`);
            console.log(`   Option: ${result.option}`);
            console.log(`   Confidence: ${result.confidence}`);
            console.log(`   Reasoning: ${result.reasoning}`);
            
            return result;
            
        } catch (error) {
            console.error('LLM matching error:', error);
            return {
                matched: false,
                option: null,
                confidence: 0,
                possibleMatches: [],
                reasoning: 'LLM matching failed'
            };
        }
    }

    /**
     * Fallback multiple choice matching using traditional methods
     * @param {string} answer - Normalized answer
     * @param {Object} question - Current question
     * @returns {Object} - Processed answer
     */
    fallbackMultipleChoiceMatching(answer, question) {
        // Try partial matches
        const partialMatches = question.options.filter(option => 
            option.toLowerCase().includes(answer) || answer.includes(option.toLowerCase())
        );

        if (partialMatches.length === 1) {
            return { answer: partialMatches[0], needsClarification: false };
        } else if (partialMatches.length > 1) {
            return {
                answer: null,
                needsClarification: true,
                clarificationMessage: this.getClarificationMessage(question, 'multiple_matches', partialMatches)
            };
        }

        // Try fuzzy matching
        const fuzzyMatches = question.options.map(option => ({
            option,
            similarity: this.calculateSimilarity(answer, option.toLowerCase())
        })).filter(match => match.similarity >= 0.7);

        if (fuzzyMatches.length === 1) {
            return { answer: fuzzyMatches[0].option, needsClarification: false };
        } else if (fuzzyMatches.length > 1) {
            return {
                answer: null,
                needsClarification: true,
                clarificationMessage: this.getClarificationMessage(question, 'fuzzy_matches', fuzzyMatches.map(m => m.option))
            };
        }

        return {
            answer: null,
            needsClarification: true,
            clarificationMessage: this.getClarificationMessage(question, 'invalid_option')
        };
    }

    /**
     * Process numeric answers with validation
     * @param {string} answer - Normalized answer
     * @param {Object} question - Current question
     * @returns {Object} - Processed answer
     */
    processNumericAnswer(answer, question) {
        // Extract numeric value from answer
        const numericMatch = answer.match(/(\d+(?:\.\d+)?)/);
        
        if (!numericMatch) {
            return {
                answer: null,
                needsClarification: true,
                clarificationMessage: this.getClarificationMessage(question, 'not_numeric')
            };
        }

        const numericValue = parseFloat(numericMatch[1]);
        
        // Validate range if specified
        if (question.validation && question.validation.range) {
            const { min, max } = question.validation.range;
            if (numericValue < min || numericValue > max) {
                return {
                    answer: null,
                    needsClarification: true,
                    clarificationMessage: this.getClarificationMessage(question, 'out_of_range', { min, max, value: numericValue })
                };
            }
        }

        return { answer: numericValue.toString(), needsClarification: false };
    }

    /**
     * Process text answers with minimum length validation
     * @param {string} answer - Normalized answer
     * @param {Object} question - Current question
     * @returns {Object} - Processed answer
     */
    processTextAnswer(answer, question) {
        const minLength = question.validation?.minLength || 3;
        
        if (answer.length < minLength) {
            return {
                answer: null,
                needsClarification: true,
                clarificationMessage: this.getClarificationMessage(question, 'too_short_text', { minLength })
            };
        }

        return { answer: answer, needsClarification: false };
    }

    /**
     * Get appropriate clarification message based on issue type
     * @param {Object} question - Current question
     * @param {string} issueType - Type of issue requiring clarification
     * @param {*} additionalData - Additional data for message formatting
     * @returns {string} - Clarification message
     */
    getClarificationMessage(question, issueType, additionalData = {}) {
        const baseMessage = `I didn't quite catch that. `;
        
        switch (issueType) {
            case 'too_short':
                return `${baseMessage}Could you please provide a more detailed answer?`;
            
            case 'unclear_yes_no':
                return `${baseMessage}Please answer with "yes" or "no" for this question.`;
            
            case 'multiple_matches':
                const options = additionalData.join(', ');
                return `${baseMessage}I found multiple possible matches: ${options}. Could you please be more specific?`;
            
            case 'fuzzy_matches':
                const fuzzyOptions = additionalData.join(', ');
                return `${baseMessage}Did you mean one of these: ${fuzzyOptions}? Please clarify.`;
            
            case 'invalid_option':
                const validOptions = question.options ? question.options.join(', ') : 'the available options';
                return `${baseMessage}Please choose from: ${validOptions}.`;
            
            case 'not_numeric':
                return `${baseMessage}Please provide a numeric value for this question.`;
            
            case 'out_of_range':
                const { min, max, value } = additionalData;
                return `${baseMessage}The value ${value} is outside the expected range (${min}-${max}). Please provide a value within this range.`;
            
            case 'too_short_text':
                const { minLength } = additionalData;
                return `${baseMessage}Please provide a more detailed response (at least ${minLength} characters).`;
            
            default:
                return `${baseMessage}Could you please repeat your answer?`;
        }
    }

    /**
     * Determine next step based on question and answer
     * @param {Object} question - Current question
     * @param {string} answer - User's answer
     * @returns {string} - Next step identifier
     */
    determineNextStep(question, answer) {
        if (question.type === 'multiple_choice') {
            return question.next[answer] || question.next.default || 'next';
        } else if (question.type === 'yes_no') {
            const normalizedAnswer = answer.toLowerCase().trim();
            if (normalizedAnswer === 'yes' || normalizedAnswer === 'y') {
                return question.next.yes || 'next';
            } else if (normalizedAnswer === 'no' || normalizedAnswer === 'n') {
                return question.next.no || 'next';
            }
        } else if (question.type === 'numeric') {
            const numValue = parseFloat(answer);
            if (!isNaN(numValue) && question.next.range) {
                const range = question.next.range;
                if (numValue >= range.min && numValue <= range.max) {
                    return range.next;
                }
            }
            return question.next.default || 'next';
        }

        return 'next';
    }

    /**
     * Get decision reason for approval/denial
     * @param {Object} question - Current question
     * @param {string} answer - User's answer
     * @returns {string} - Decision reason
     */
    getDecisionReason(question, answer) {
        if (question.type === 'multiple_choice') {
            if (answer === 'Type 1 Diabetes') {
                return 'GLP-1 receptor agonists are not indicated for Type 1 Diabetes';
            } else if (answer === 'Other') {
                return 'Indication not covered under current authorization criteria';
            }
        } else if (question.type === 'yes_no') {
            const normalizedAnswer = answer.toLowerCase().trim();
            if (normalizedAnswer === 'yes' || normalizedAnswer === 'y') {
                if (question.id === 'contraindications') {
                    return 'Patient has contraindications to therapy';
                }
            } else if (normalizedAnswer === 'no' || normalizedAnswer === 'n') {
                if (question.id === 'step_1_required') {
                    return 'Patient has not tried required step 1 medications';
                } else if (question.id === 'conventional_therapy') {
                    return 'Patient has not tried conventional therapy';
                }
            }
        }

        return 'Based on clinical criteria evaluation';
    }

    /**
     * Add a conversation turn to the session history
     * @param {string} sessionId - Session identifier
     * @param {string} speaker - 'user' or 'assistant'
     * @param {string} message - The message content
     */
    addConversationTurn(sessionId, speaker, message) {
        const session = this.getSession(sessionId);
        if (session) {
            session.conversationHistory.push({
                speaker,
                message,
                timestamp: new Date()
            });
            
            // Keep only last 20 turns to manage memory
            if (session.conversationHistory.length > 20) {
                session.conversationHistory = session.conversationHistory.slice(-20);
            }
            
            this.updateSession(sessionId, session);
        }
    }

    /**
     * Build conversation context for LLM
     * @param {string} sessionId - Session identifier
     * @returns {Array} - Array of conversation messages
     */
    buildConversationContext(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) return [];
        
        // Convert conversation history to OpenAI format
        const messages = session.conversationHistory.slice(-10).map(turn => ({
            role: turn.speaker,
            content: turn.message
        }));
        
        return messages;
    }

    /**
     * Get recent conversation summary
     * @param {string} sessionId - Session identifier
     * @returns {string} - Summary of recent conversation
     */
    getConversationSummary(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || session.conversationHistory.length === 0) return '';
        
        const recentTurns = session.conversationHistory.slice(-5);
        return recentTurns.map(turn => `${turn.speaker}: ${turn.message}`).join('\n');
    }

    /**
     * Get session summary
     * @param {string} sessionId - Session identifier
     * @returns {Object} - Session summary
     */
    getSessionSummary(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) return null;

        return {
            id: session.id,
            status: session.status,
            step: session.step,
            memberName: session.memberName,
            dateOfBirth: session.dateOfBirth,
            drugName: session.drugName,
            decision: session.decision,
            decisionReason: session.decisionReason,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
        };
    }

    /**
     * End session
     * @param {string} sessionId - Session identifier
     */
    endSession(sessionId) {
        const session = this.getSession(sessionId);
        if (session) {
            session.status = 'completed';
            session.endedAt = new Date();
            this.updateSession(sessionId, session);
        }
    }

    /**
     * Get all active sessions
     * @returns {Array} - Array of active sessions
     */
    getActiveSessions() {
        return Array.from(this.sessions.values())
            .filter(session => session.status === 'active')
            .map(session => this.getSessionSummary(session.id));
    }

    /**
     * Clean up old sessions
     * @param {number} maxAge - Maximum age in hours
     */
    cleanupOldSessions(maxAge = 24) {
        const cutoff = new Date(Date.now() - maxAge * 60 * 60 * 1000);
        
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.createdAt < cutoff) {
                this.sessions.delete(sessionId);
            }
        }
    }

    /**
     * Debug method to test drug matching
     * @param {string} drugName - Drug name to test
     */
    debugDrugMatching(drugName) {
        if (!this.drugsData || !this.dataLoaded) {
            console.log('❌ Drug data not loaded');
            return;
        }

        const searchTerm = drugName.toLowerCase().trim();
        console.log(`\n🔍 Debugging drug matching for: "${drugName}"`);
        console.log(`   Search term: "${searchTerm}" (length: ${searchTerm.length})`);
        
        // Check all drugs for similarity
        const allMatches = this.drugsData.drugs.map(drug => {
            const nameSimilarity = this.calculateSimilarity(searchTerm, drug.name.toLowerCase());
            const genericSimilarity = this.calculateSimilarity(searchTerm, drug.genericName.toLowerCase());
            const commonNameSimilarities = drug.commonNames.map(name => 
                this.calculateSimilarity(searchTerm, name.toLowerCase())
            );
            
            const maxSimilarity = Math.max(
                nameSimilarity, 
                genericSimilarity, 
                ...commonNameSimilarities
            );
            
            return { 
                drug, 
                similarity: maxSimilarity,
                nameSimilarity,
                genericSimilarity,
                commonNameSimilarities
            };
        }).sort((a, b) => b.similarity - a.similarity);
        
        console.log('\n📊 All drug similarities:');
        allMatches.forEach((match, index) => {
            console.log(`   ${index + 1}. ${match.drug.name} (${Math.round(match.similarity * 100)}%)`);
            console.log(`      - Name similarity: ${Math.round(match.nameSimilarity * 100)}%`);
            console.log(`      - Generic similarity: ${Math.round(match.genericSimilarity * 100)}%`);
            console.log(`      - Common names: ${match.drug.commonNames.join(', ')}`);
        });
        
        // Test the actual matching logic
        console.log('\n🧪 Testing actual matching logic:');
        const result = this.findDrugWithConfidence(drugName);
        console.log(`   Result: ${result.drug ? result.drug.name : 'No match'} (confidence: ${Math.round(result.confidence * 100)}%)`);
    }
}

module.exports = new SessionService(); 