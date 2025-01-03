// services/leagueClientService.js

import { calculateLiveStats } from './liveMatchStats.js';  // Your existing processing logic
let leagueApi = null;

function loadAxiosScript() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/axios@1.6.2/dist/axios.min.js';
        script.onload = () => resolve(window.axios);
        script.onerror = () => reject(new Error('Failed to load axios'));
        document.head.appendChild(script);
    });
}

async function setupAxios() {
    try {
        const axios = await loadAxiosScript();
        
        // Now we can safely create the API instance
        leagueApi = axios.create({
            baseURL: 'https://127.0.0.1:2999',
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Failed to initialize axios:', error);
    }
}

// Initialize axios when the module loads
await setupAxios();

// Game state management
const gameState = {
    currentLiveStats: null,
    lastValidGameData: null,
    previousGameStats: null,
    gameActive: false,
    timestamp: null,
    historicalData: null
};

export async function fetchGameData(retries = 3) {
    if (!leagueApi) {
        await setupAxios();
    }

    try {
        const response = await leagueApi.get('/liveclientdata/allgamedata');
        
        if (!isValidGameData(response.data)) {
            console.log('Invalid live game data - using historical data');
            return handleNoLiveGame();
        }
        
        const processedStats = await calculateLiveStats(response.data);
        updateGameState(processedStats);
        
        return {
            currentLiveStats: gameState.currentLiveStats,
            previousGameStats: gameState.previousGameStats,
            gameActive: gameState.gameActive,
            historicalData: gameState.historicalData
        };

    } catch (error) {
        if (retries > 0) {
            console.log(`Retrying... ${retries} attempts remaining`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            return fetchGameData(retries - 1);
        }
        console.log('Error fetching live data:', error.message);
        return handleNoLiveGame();
    }
}

// Keep your existing validation function
export function isValidGameData(data) {
    return Boolean(
        data &&
        data.events?.Events &&
        Array.isArray(data.events.Events) &&
        data.allPlayers &&
        Array.isArray(data.allPlayers)
    );
}

function handleNoLiveGame() {
    // If we were tracking a game that just ended
    if (gameState.gameActive && gameState.currentLiveStats) {
        console.log('Game ended - saving current game data');
        gameState.lastValidGameData = JSON.parse(JSON.stringify(gameState.currentLiveStats));
        gameState.gameActive = false;
    }

    // Return appropriate data for display
    return {
        currentLiveStats: gameState.lastValidGameData || gameState.historicalData,
        previousGameStats: gameState.previousGameStats,
        gameActive: false,
        historicalData: gameState.historicalData
    };
}

function updateGameState(newData) {
    gameState.timestamp = Date.now();

    if (!gameState.gameActive && hasValidStats(newData)) {
        console.log('New game starting');
        if (gameState.lastValidGameData) {
            gameState.previousGameStats = JSON.parse(JSON.stringify(gameState.lastValidGameData));
        }
        gameState.gameActive = true;
        gameState.currentLiveStats = JSON.parse(JSON.stringify(newData));
    } else if (gameState.gameActive && hasValidStats(newData)) {
        gameState.currentLiveStats = JSON.parse(JSON.stringify(newData));
        gameState.lastValidGameData = JSON.parse(JSON.stringify(newData));
    }
}


function hasValidStats(data) {
    return ['kills', 'deaths', 'assists'].some(stat => 
        (data[stat]?.length || 0) > 0
    );
}

export function clearGameState() {
    // Clear game state but preserve historical data
    gameState.currentLiveStats = null;
    gameState.lastValidGameData = gameState.historicalData;
    gameState.previousGameStats = null;
    gameState.gameActive = false;
    gameState.timestamp = null;
}

export const getCurrentGameState = () => ({
    currentLiveStats: gameState.currentLiveStats || gameState.lastValidGameData || gameState.historicalData,
    previousGameStats: gameState.previousGameStats,
    gameActive: gameState.gameActive,
    historicalData: gameState.historicalData
});

export function initializeWithHistoricalData(historicalData) {
    gameState.historicalData = historicalData;
    // Structure matches your chart expectations
    if (!gameState.currentLiveStats && historicalData) {
        gameState.lastValidGameData = {
            playerStats: historicalData.playerStats || {},
            teamStats: historicalData.teamStats || {},
            enemyStats: historicalData.enemyStats || {}
        };
    }
}