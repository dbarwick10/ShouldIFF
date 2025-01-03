// Log when module starts loading to help with debugging
console.log('Module loading');

// Import required functionality
import { displayAverageEventTimes } from './components/displayAverageEventTimes.js';
import { LOCAL_TESTING } from "./components/config/constraints.js"; 

// Helper function to parse URL parameters for bookmarking and sharing
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        summonerName: params.get('summoner') || '',
        tagLine: params.get('tag') || '',
        region: params.get('region') || 'americas',
        gameMode: params.get('mode')
    };
}

// Helper function to clean taglines of special characters
function cleanTagline(tagline) {
    return tagline.replace(/^[#%23]/, '');
}

// Updates the URL when form values change for sharing/bookmarking
function updateUrl(params) {
    const url = new URL(window.location.href);
    url.search = '';
    
    // Maintain consistent parameter order
    const paramOrder = ['summoner', 'tag', 'region', 'mode'];
    
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
    
    window.history.pushState({}, '', url);
}

// Updates form input values based on URL parameters
function updateFormInputs(params) {
    document.getElementById('summonerName').value = params.summonerName;
    document.getElementById('tagLine').value = cleanTagline(params.tagLine);
    document.getElementById('region').value = params.region;
    document.getElementById('gameMode').value = params.gameMode;
}

// Main application initialization function
async function initializeApplication() {
    console.log('Initializing application');
    
    // Wait for DOM to be fully loaded before proceeding
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }
    
    console.log('DOM is ready');
    
    // Get all required DOM elements
    const analyzeButton = document.getElementById('fetchStatsButton');
    const loading = document.getElementById('loading');
    const inputSection = document.querySelector('.input-section');
    const chartContainer = document.querySelector('.chart-container');
    const chartLegend = document.querySelector('.chart-legend');
    const howToUseThis = document.querySelector('.how-to-use-this');
    
    // Verify critical elements exist
    if (!analyzeButton || !loading || !inputSection) {
        console.error('Critical elements not found. Check HTML structure.');
        return;
    }
    
    console.log('Button element:', analyzeButton);
    
    // Loading state configuration
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
    
    // State management variables
    let currentLoadingState = 0;
    let loadingInterval;
    let currentCleanup = null;
    let lastSuccessfulSearch = null;
    
    // Error display helper
    function displayError(message, details = '') {
        clearInterval(loadingInterval);
        loading.innerHTML = `
            <div class="error-message">
                <strong>Error</strong>
                <p>${message}</p>
            </div>
        `;
    }

    // Loading state update helper
    function updateLoadingState() {
        loading.innerHTML = `
            <strong>${loadingStates[currentLoadingState]}</strong>
            <div id="loading-circle"></div>
        `;
    }

    // Main stats handling function
    async function handleStats(formData) {
        try {
            // Prevent duplicate searches
            if (lastSuccessfulSearch && 
                formData.summonerName.toLowerCase() === lastSuccessfulSearch.summonerName.toLowerCase() &&
                formData.tagLine.toLowerCase() === lastSuccessfulSearch.tagLine.toLowerCase() &&
                formData.region === lastSuccessfulSearch.region &&
                formData.gameMode === lastSuccessfulSearch.gameMode) {
                alert('Update your summoner name, tagline or game mode and try again');
                return;
            }

            // Cleanup and UI preparation
            if (currentCleanup) {
                currentCleanup();
                currentCleanup = null;
            }

            if (chartContainer) chartContainer.style.display = 'none';
            if (chartLegend) chartLegend.style.display = 'none';

            // Initialize loading state
            analyzeButton.disabled = true;
            inputSection.style.display = 'none';
            loading.style.display = 'flex';
            howToUseThis.style.display = 'none';
            currentLoadingState = 0;
            updateLoadingState();

            // Start loading message cycle
            loadingInterval = setInterval(() => {
                currentLoadingState = (currentLoadingState + 1) % loadingStates.length;
                updateLoadingState();
            }, 23000);

            updateUrl(formData);

            // API request
            const prodURL = 'https://shouldiffserver-test.onrender.com';
            const localURL = 'http://shouldiff.ddns.net:3000/api/stats';
            
            const response = await fetch(LOCAL_TESTING ? localURL : prodURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            let data;
            try {
                data = await response.json();
            } catch (e) {
                throw new Error('Failed to parse server response');
            }

            if (!response.ok) {
                displayError(data.error || 'An unexpected error occurred', data.details || '');
                inputSection.style.display = 'block';
                analyzeButton.disabled = false;
                return;
            }

            if (!data.playerStats || !data.teamStats || !data.enemyTeamStats) {
                throw new Error('Invalid data received from server');
            }

            if (data.averageEventTimes) {
                const result = await displayAverageEventTimes(data.averageEventTimes, data.liveStats);
                currentCleanup = result.cleanup;
            }

            // Cleanup and UI updates
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

    // Set up event listeners
    analyzeButton.addEventListener('click', async function() {
        console.log('Button clicked');

        const formData = {
            summonerName: document.getElementById('summonerName').value.trim(),
            tagLine: document.getElementById('tagLine').value.trim(),
            region: document.getElementById('region').value,
            gameMode: document.getElementById('gameMode').value
        };

        if (!formData.summonerName || !formData.tagLine) {
            alert('Please enter both summoner name and tagline');
            return;
        }

        await handleStats(formData);
    });

    // Set up form change listeners for URL updates
    ['summonerName', 'tagLine', 'region', 'gameMode'].forEach(inputId => {
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

    // Handle browser navigation
    window.addEventListener('popstate', () => {
        const params = getUrlParams();
        updateFormInputs(params);
        if (params.summonerName && params.tagLine) {
            handleStats(params);
        }
    });

    // Initialize with URL parameters if present
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

    console.log('Application initialized');
}

// Start the application
initializeApplication().catch(error => {
    console.error('Failed to initialize application:', error);
});