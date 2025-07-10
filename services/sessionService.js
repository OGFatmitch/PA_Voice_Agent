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
            decisionReason: null
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
     * Process answer and move to next question
     * @param {string} sessionId - Session identifier
     * @param {string} answer - User's answer
     * @returns {Object} - Next step information
     */
    processAnswer(sessionId, answer) {
        const session = this.getSession(sessionId);
        if (!session) return { action: 'error', message: 'Session not found' };

        const currentQuestion = this.getCurrentQuestion(sessionId);
        if (!currentQuestion) return { action: 'complete', decision: session.decision };

        // Store the answer
        session.answers[currentQuestion.id] = answer;

        // Determine next step based on question type and answer
        const nextStep = this.determineNextStep(currentQuestion, answer);
        
        if (nextStep === 'approve' || nextStep === 'deny' || nextStep === 'documentation_required') {
            session.decision = nextStep;
            session.step = 'complete';
            session.decisionReason = this.getDecisionReason(currentQuestion, answer);
            return { action: 'complete', decision: nextStep, reason: session.decisionReason };
        }

        // Move to next question
        session.currentQuestionIndex++;
        this.updateSession(sessionId, session);

        return { action: 'next_question', question: this.getCurrentQuestion(sessionId) };
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