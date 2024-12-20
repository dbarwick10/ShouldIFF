import { displayAverageEventTimes } from './components/displayAverageEventTimes.js';
import { LOCAL_TESTING } from "./components/config/constraints.js"; 

document.addEventListener('DOMContentLoaded', function() {
    const analyzeButton = document.getElementById('fetchStatsButton');
    const loading = document.getElementById('loading');
    const inputSection = document.querySelector('.input-section');
    const chartContainer = document.querySelector('.chart-container');
    const chartLegend = document.querySelector('.chart-legend');
    
    // Loading state messages
    const loadingStates = [
        'Fetching player information...',
        'Gathering match event data...',
        'Collecting match timeline...',
        'Analyzing player performance...',
        'Calculating event timings...',
        'Checking live game data...',
        'Well, this is embarassing - how long should this take...',
        'Seriously? Is this still going?',
        `Well, if you're still here, might as well stay a bit longer...`
    ];
    
    // State variables
    let currentLoadingState = 0;
    let loadingInterval;
    let currentCleanup = null;
    let lastSuccessfulSearch = null;
    
    // Helper function to display error messages
    function displayError(message, details = '') {
        clearInterval(loadingInterval);
        loading.innerHTML = `
            <div class="error-message">
                <strong>Error</strong>
                <p>${message}</p>
            </div>
        `;
    }

    // Helper function to update loading state
    function updateLoadingState() {
        loading.innerHTML = `
            <strong>${loadingStates[currentLoadingState]}</strong>
            <div id="loading-circle"></div>
        `;
    }

    if (analyzeButton) {
        analyzeButton.addEventListener('click', async function() {
            try {
                // Get form data
                const formData = {
                    summonerName: document.getElementById('summonerName').value.trim(),
                    tagLine: document.getElementById('tagLine').value.trim(),
                    region: document.getElementById('region').value,
                    gameMode: document.getElementById('gameMode').value
                };

                // Validate input
                if (!formData.summonerName || !formData.tagLine) {
                    alert('Please enter both summoner name and tagline');
                    return;
                }

                // Check for duplicate search
                if (lastSuccessfulSearch && 
                    formData.summonerName.toLowerCase() === lastSuccessfulSearch.summonerName.toLowerCase() &&
                    formData.tagLine.toLowerCase() === lastSuccessfulSearch.tagLine.toLowerCase() &&
                    formData.region === lastSuccessfulSearch.region &&
                    formData.gameMode === lastSuccessfulSearch.gameMode) {
                    alert('Update your summoner name, tagline or game mode and try again');
                    return;
                }

                // Clean up existing charts
                if (currentCleanup) {
                    currentCleanup();
                    currentCleanup = null;
                }

                // Hide existing content
                if (chartContainer) chartContainer.style.display = 'none';
                if (chartLegend) chartLegend.style.display = 'none';

                // Initialize loading state
                this.disabled = true;
                inputSection.style.display = 'none';
                loading.style.display = 'flex';
                currentLoadingState = 0;
                updateLoadingState();

                // Start loading state cycle
                loadingInterval = setInterval(() => {
                    currentLoadingState = (currentLoadingState + 1) % loadingStates.length;
                    updateLoadingState();
                }, 23000);

                // Make API request
                const localURL = 'http://127.0.0.1:3000/api/stats';
                const prodURL = 'https://shouldiffserver-new.onrender.com/api/stats';
                
                const response = await fetch(LOCAL_TESTING ? localURL : prodURL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });

                let data;
                try {
                    data = await response.json();
                } catch (e) {
                    throw new Error('Failed to parse server response');
                }

                if (!response.ok) {
                    const errorMessage = data.error || 'An unexpected error occurred';
                    const errorDetails = data.details || '';
                    displayError(errorMessage, errorDetails);
                    inputSection.style.display = 'block';
                    this.disabled = false;
                    return;
                }

                // Validate response data
                if (!data.playerStats || !data.teamStats || !data.enemyTeamStats) {
                    throw new Error('Invalid data received from server');
                }

                // Display event times if available
                if (data.averageEventTimes) {
                    const result = await displayAverageEventTimes(data.averageEventTimes, data.liveStats);
                    currentCleanup = result.cleanup;
                }

                // Clean up and update UI
                clearInterval(loadingInterval);
                lastSuccessfulSearch = { ...formData };
                loading.style.display = 'none';
                this.disabled = false;
                inputSection.style.display = 'block';
                this.textContent = 'Fetch New Stats';

            } catch (error) {
                let displayMessage = 'An unexpected error occurred. Please try again.';
                let details = '';

                if (error.message === 'Failed to fetch') {
                    displayMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
                } else if (error.message.includes('Failed to fetch PUUID')) {
                    try {
                        const riotError = JSON.parse(error.message.split('Failed to fetch PUUID:')[1]);
                        displayMessage = riotError.status.message;
                    } catch (e) {
                        details = error.message;
                    }
                }

                displayError(displayMessage, details);
                inputSection.style.display = 'block';
                this.disabled = false;

                // Show chart container and legend again if there was an error
                if (chartContainer) chartContainer.style.display = 'grid';
                if (chartLegend) chartLegend.style.display = 'flex';
            }
        });
    }

    // Cleanup on page unload
    window.addEventListener('unload', () => {
        if (currentCleanup) {
            currentCleanup();
        }
    });
});