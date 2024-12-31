import { displayAverageEventTimes } from './components/displayAverageEventTimes.js';
import { LOCAL_TESTING } from "./components/config/constraints.js"; 

// URL Parameter handling functions
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        summonerName: params.get('summoner') || '',
        tagLine: params.get('tag') || '',
        region: params.get('region') || 'americas',
        gameMode: params.get('mode')
    };
}

function cleanTagline(tagline) {
    return tagline.replace(/^[#%23]/, '');
}

function updateUrl(params) {
    // Create a new URL object
    const url = new URL(window.location.href);
    
    // Clear existing parameters
    url.search = '';
    
    // Define the desired parameter order
    const paramOrder = ['summoner', 'tag', 'region', 'mode'];
    
    // Add parameters in the specified order
    paramOrder.forEach(param => {
        switch(param) {
            case 'summoner':
                if (params.summonerName) url.searchParams.append('summoner', params.summonerName);
                break;
            case 'tag':
                if (params.tagLine) url.searchParams.append('tag', cleanTagline(params.tagLine));
                break;
            case 'region':
                if (params.region) url.searchParams.append('region', params.region);
                break;
            case 'mode':
                url.searchParams.append('mode', params.gameMode || 'all');
                break;
        }
    });
    
    // Update the URL
    window.history.pushState({}, '', url);
}

function updateFormInputs(params) {
    document.getElementById('summonerName').value = params.summonerName;
    document.getElementById('tagLine').value = cleanTagline(params.tagLine);
    document.getElementById('region').value = params.region;
    document.getElementById('gameMode').value = params.gameMode;
}

document.addEventListener('DOMContentLoaded', function() {
    const analyzeButton = document.getElementById('fetchStatsButton');
    const loading = document.getElementById('loading');
    const inputSection = document.querySelector('.input-section');
    const chartContainer = document.querySelector('.chart-container');
    const chartLegend = document.querySelector('.chart-legend');
    const howToUseThis = document.querySelector('.how-to-use-this');
    
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

    async function handleStats(formData) {
        try {
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
            analyzeButton.disabled = true;
            inputSection.style.display = 'none';
            loading.style.display = 'flex';
            howToUseThis.style.display = 'none';
            currentLoadingState = 0;
            updateLoadingState();

            // Start loading state cycle
            loadingInterval = setInterval(() => {
                currentLoadingState = (currentLoadingState + 1) % loadingStates.length;
                updateLoadingState();
            }, 23000);

            // Update URL with current form data
            updateUrl(formData);

            // Make API request
            const localURL = 'https://static.developer.riotgames.com/docs/lol/liveclientdata_sample.json';
            const prodURL = 'http://127.0.0.1:3000/api/stats';
            
            const response = LOCAL_TESTING ? await fetch(prodURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            }) : await fetch(localURL);

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
                analyzeButton.disabled = false;
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
            analyzeButton.disabled = false;
            inputSection.style.display = 'block';
            analyzeButton.textContent = 'Fetch New Stats';

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
            analyzeButton.disabled = false;

            if (chartContainer) chartContainer.style.display = 'grid';
            if (chartLegend) chartLegend.style.display = 'flex';
        }
    }

    if (analyzeButton) {
        analyzeButton.addEventListener('click', async function() {
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

            await handleStats(formData);
        });
    }

    // Set up form change listeners for URL updates
    const inputs = ['summonerName', 'tagLine', 'region', 'gameMode'];
    inputs.forEach(inputId => {
        document.getElementById(inputId).addEventListener('change', () => {
            const currentParams = {
                summonerName: document.getElementById('summonerName').value,
                tagLine: document.getElementById('tagLine').value,
                region: document.getElementById('region').value,
                gameMode: document.getElementById('gameMode').value
            };
            updateUrl(currentParams);
        });
    });

    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
        const params = getUrlParams();
        updateFormInputs(params);
        if (params.summonerName && params.tagLine) {
            handleStats(params);
        }
    });

    // Initialize form with URL parameters
    const initialParams = getUrlParams();
    updateFormInputs(initialParams);
    if (initialParams.summonerName && initialParams.tagLine) {
        handleStats(initialParams);
    }

    // Cleanup on page unload
    window.addEventListener('unload', () => {
        if (currentCleanup) {
            currentCleanup();
        }
    });
});